"""On-demand analysis of NISAR GCOV acquisitions around any location.

Output has exactly the same format as the batch pipeline
(manifest.json + grid.bin + img/*.png), so the web app can show either.
"""
from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import h5py
import numpy as np
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "scripts" / "processing"), str(Path(__file__).parent)]
import radar  # noqa: E402
from process_stack import (CHANGE_RANGE, SCREENING, STRETCH, _rgba_change, _rgba_class, _rgba_gray,  # noqa: E402
                           _save, corners_lonlat)
from nisar import read_window_multi, scene_epsg  # noqa: E402
from remote_h5 import RemoteFile  # noqa: E402

MAX_SIZE_KM = 40
MAX_SCENES = 12


def memory_limit_bytes() -> int | None:
    """The container's memory limit (Linux cgroup v2 or v1), or None when unlimited/unknown."""
    for p in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            v = Path(p).read_text().strip()
        except OSError:
            continue
        if v.isdigit() and int(v) < 1 << 60:
            return int(v)
    return None


def _workers(env: str, small: int, large: int) -> int:
    v = os.environ.get(env, "")
    if v.isdigit() and int(v) > 0:
        return int(v)
    lim = memory_limit_bytes()
    return small if lim is not None and lim < 2 * 1024 ** 3 else large


# Acquisitions read at once within one analysis, and analyses run at once. A small host
# (Render free: 512 MB) gets 2 and 1: a 40 km, 6-date analysis then peaks near 310 MB
# (it was 655 MB before strip binning). A laptop gets 4 and 2. Override with the env vars.
SCENE_WORKERS = _workers("DELTA_PULSE_SCENE_WORKERS", 2, 4)
# With room to spare, each acquisition's masks and both polarisations are fetched in ONE parallel batch
# (~30 MB per acquisition at once) instead of one dataset after another; a small host keeps the
# one-at-a-time path that holds a single dataset in memory.
FETCH_TOGETHER = SCENE_WORKERS >= 4
JOB_WORKERS = _workers("DELTA_PULSE_JOB_WORKERS", 1, 2)


class AnalysisError(ValueError):
    pass


def validate_request(granules: list[dict], size_km: float):
    if not 2 <= len(granules) <= MAX_SCENES:
        raise AnalysisError(f"choose between 2 and {MAX_SCENES} acquisitions")
    if not 2 <= size_km <= MAX_SIZE_KM:
        raise AnalysisError(f"window size must be 2-{MAX_SIZE_KM} km")
    keys = {(g["track"], g["direction"], g["frame"], g["bandwidth"], g["crid"], g["collection"]) for g in granules}
    if len(keys) != 1:
        raise AnalysisError("acquisitions must come from one compatible stack "
                            "(same track, pass, frame, bandwidth and processing release)")
    bad = [g["date"] for g in granules if g["maturity"] not in ("PROVISIONAL", "VALIDATED", "URGENT_RESPONSE")]
    if bad:
        raise AnalysisError(f"pre-calibration (BETA/other) products are not analysed: {bad}")
    if len({g["date"] for g in granules}) != len(granules):
        raise AnalysisError("duplicate acquisition dates")


DETAIL = {
    # standard: frequency A (main band, 10-20 m posting), output <= ~500 px
    "standard": {"grid": "/science/LSAR/GCOV/grids/frequencyA", "min_res": 40.0, "px": 500},
    # quick: frequency B (5 MHz side band, 80 m posting) - same acquisition, coarser, ~10x less to read
    "quick": {"grid": "/science/LSAR/GCOV/grids/frequencyB", "min_res": 80.0, "px": 250},
}


def window_grid(lat, lon, size_km, epsg, detail: str = "standard"):
    """Square window centred on the point, in the scene's UTM CRS."""
    d = DETAIL[detail]
    res = float(max(d["min_res"], round(size_km * 1000 / d["px"] / 20) * 20))
    cx, cy = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
    half = size_km * 500.0
    x0 = np.floor((cx - half) / res) * res
    y1 = np.ceil((cy + half) / res) * res
    n = int(round(2 * half / res))
    return x0, y1, res, n, n


def run_analysis(out: Path, lat: float, lon: float, size_km: float, granules: list[dict], token: str,
                 place: str | None = None, progress=lambda msg, frac: None,
                 result_id: str | None = None, detail: str = "standard") -> dict:
    validate_request(granules, size_km)
    if detail not in DETAIL:
        raise AnalysisError(f"detail must be one of {list(DETAIL)}")
    grid_path = DETAIL[detail]["grid"]
    granules = sorted(granules, key=lambda g: g["start_time"])
    (out / "img").mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    min_vf = SCREENING["min_valid_fraction"]["value"]
    stats = {"bytes_fetched": 0, "requests": 0}

    # Every acquisition is opened at once: each one fixes the window from its own projection (all
    # acquisitions of a stack share the frame CRS, checked below), so none waits for another to open.
    progress(f"Reading {len(granules)} acquisitions from NASA's archive in parallel", 0.03)

    def process(idx_g):
        idx, g = idx_g
        rf = RemoteFile(g["url"], token)
        dbs, vfs = {}, {}
        with h5py.File(rf, "r") as f:
            epsg = scene_epsg(f)
            x0, y1, res, nx, ny = window_grid(lat, lon, size_km, epsg, detail)
            xlim = (x0 - res, x0 + nx * res + res)
            ylim = (y1 - ny * res - res, y1 + res)
            if grid_path not in f:
                raise AnalysisError(f"{g['date']} has no {grid_path.rsplit('/', 1)[-1]} band; use standard detail")
            def binned(pol, x, y, p_raw, ok):  # each polarisation is binned and freed as soon as it is read
                acc = radar.GridAccumulator(x0, y1, res, nx, ny)
                acc.add(x, y, p_raw, ok)
                p, vf = acc.mean(), acc.valid_fraction()
                p[vf < min_vf] = np.nan
                dbs[pol], vfs[pol] = radar.to_db(p), vf

            read_window_multi(f, xlim, ylim, rf=rf, grid=grid_path, on_pol=binned, together=FETCH_TOGETHER)
        rf.release()
        return idx, g, dbs, vfs, rf.bytes_fetched, rf.n_requests, (epsg, x0, y1, res, nx, ny)

    results = [None] * len(granules)
    done = 0
    from concurrent.futures import as_completed
    with ThreadPoolExecutor(max_workers=SCENE_WORKERS) as ex:  # total HTTP concurrency is capped in remote_h5
        futs = [ex.submit(process, ig) for ig in enumerate(granules)]
        for fut in as_completed(futs):
            idx, g, dbs, vfs, nb, nr, geo = fut.result()
            results[idx] = (g, dbs, vfs, geo)
            stats["bytes_fetched"] += nb
            stats["requests"] += nr
            done += 1
            progress(f"Read {g['date']} ({done}/{len(granules)})", 0.05 + 0.85 * done / len(granules))

    epsg, x0, y1, res, nx, ny = results[0][3]
    for g, _, _, geo in results[1:]:
        if geo[0] != epsg:
            raise AnalysisError(f"{g['date']} is in a different projection; cannot align")
    obs, grids = [], []
    for g, dbs, vfs, _ in results:
        if "HH" not in dbs or not np.isfinite(dbs["HH"]).any():
            raise AnalysisError(f"no valid radar data at this location on {g['date']} "
                                "(outside the swath or masked)")
        for pol, d in dbs.items():
            _save(_rgba_gray(d, *STRETCH[pol]), out / "img" / f"{g['date']}_{pol}.png")
        cls = radar.screen(dbs["HH"], dbs.get("HV"), SCREENING)
        _save(_rgba_class(cls), out / "img" / f"{g['date']}_class.png")
        valid = np.isfinite(dbs["HH"])
        obs.append({"id": g["date"], "date": g["date"], "start_time": g["start_time"], "scene": g["scene"],
                    "crid": g["crid"], "epsg": epsg, "channels": [c for c in ("HH", "HV") if c in dbs],
                    "track": g["track"], "frame": g["frame"], "direction": g["direction"],
                    "maturity": g["maturity"], "collection": g["collection"],
                    "valid_fraction": round(float(valid.mean()), 4),
                    "screening_counts": {"low_backscatter": int((cls == radar.LOW_BACKSCATTER).sum()),
                                         "double_bounce": int((cls == radar.DOUBLE_BOUNCE).sum()),
                                         "valid_cells": int(valid.sum())},
                    "cell_area_km2": (res / 1000) ** 2, "downloaded_utc": None,
                    "read_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        grids.append(dbs)

    progress("Computing changes", 0.93)
    sig = SCREENING["change"]["significant_db"]["value"]
    pairs = []
    for a, b, ga, gb in zip(obs, obs[1:], grids, grids[1:]):
        pid = f"{a['date']}_{b['date']}"
        dd = (date.fromisoformat(b["date"]) - date.fromisoformat(a["date"])).days
        pr = {"id": pid, "before": a["date"], "after": b["date"], "delta_days": dd, "nominal_repeat": dd == 12,
              "channels": [c for c in ("HH", "HV") if c in ga and c in gb]}
        for pol in pr["channels"]:
            d = radar.change_db(ga[pol], gb[pol])
            _save(_rgba_change(d), out / "img" / f"d_{pid}_{pol}.png")
            fin = d[np.isfinite(d)]
            pr[f"{pol}_change"] = {"mean_db": float(fin.mean()) if fin.size else None,
                                   "frac_increase": float((fin >= sig).mean()) if fin.size else None,
                                   "frac_decrease": float((fin <= -sig).mean()) if fin.size else None}
        pairs.append(pr)

    # Inspection grid at full window resolution (same layout as the batch pipeline).
    grid = np.full((len(obs), 3, ny, nx), -32768, np.int16)
    for oi, dbs in enumerate(grids):
        for ci, pol in enumerate(("HH", "HV")):
            if pol in dbs:
                d = dbs[pol]
                grid[oi, ci] = np.where(np.isfinite(d), np.round(d * 100), -32768).astype(np.int16)
        grid[oi, 2] = np.round(np.isfinite(dbs["HH"]) * 10000).astype(np.int16)
    grid.tofile(out / "grid.bin")

    tr = Transformer.from_crs(epsg, 4326, always_xy=True)
    lon0, lat0 = tr.transform(x0, y1 - ny * res)
    lon1, lat1 = tr.transform(x0 + nx * res, y1)
    manifest = {
        "area": "live", "stack": result_id or out.name, "name": place or f"{lat:.4f}°, {lon:.4f}°",
        "bbox": [round(lon0, 5), round(lat0, 5), round(lon1, 5), round(lat1, 5)],
        "center": [lon, lat], "size_km": size_km, "detail": detail,
        "is_demonstration": False, "demonstration_note": None,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "epsg": epsg,
        "display": {"res_m": res, "nx": nx, "ny": ny, "x0": x0, "y1": y1,
                    "corners": corners_lonlat(x0, y1, res, nx, ny, epsg)},
        "grid": {"file": "grid.bin", "dtype": "int16", "scale": 0.01, "nodata": -32768,
                 "shape": [len(obs), 3, ny, nx], "channels": ["HH_db", "HV_db", "valid_frac_x1e4"],
                 "res_m": res, "x0": x0, "y1": y1},
        "stretch_db": STRETCH, "change_range_db": CHANGE_RANGE, "screening": SCREENING,
        "observations": obs, "pairs": pairs,
        "processing": {"steps": [
            "live ASF search for NISAR L2 GCOV covering the point",
            f"parallel HTTP range reads of the {grid_path.rsplit('/', 1)[-1]} HHHH/HVHV chunks in the window (no full download)",
            "exclude non-finite, <=0, mask 0/255 and inputDataExceptionMask samples",
            f"bin onto a common {res:.0f} m grid in EPSG:{epsg} by mean linear power",
            f"drop cells with valid fraction < {min_vf}",
            "dB = 10*log10(power); change = dB(after) - dB(before), consecutive dates",
            "screening rules from screening.json (UNCALIBRATED)"],
            "script": "backend/analyze.py",
            "elapsed_s": round(time.time() - t0, 1),
            "bytes_fetched": stats["bytes_fetched"], "range_requests": stats["requests"]},
    }
    # manifest.json is written last and atomically: its presence marks a complete result.
    tmp = out / "manifest.json.tmp"
    tmp.write_text(json.dumps(manifest, indent=1, default=str))
    for attempt in range(10):  # Windows/OneDrive can hold a fresh file briefly
        try:
            os.replace(tmp, out / "manifest.json")
            break
        except PermissionError:
            time.sleep(0.5 * (attempt + 1))
    else:
        raise IOError("could not finalise manifest.json")
    progress("Done", 1.0)
    return manifest
