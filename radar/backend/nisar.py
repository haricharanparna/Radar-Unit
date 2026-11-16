"""Live NISAR GCOV discovery for any location, and remote window reading."""
from __future__ import annotations

import re
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "scripts" / "processing")]
from config import COLLECTION_MATURITY  # noqa: E402
from gcov_reader import DIAGONAL_TERMS, quality_ok  # noqa: E402

GRID = "/science/LSAR/GCOV/grids/frequencyA"
# BETA is pre-calibration: listed, never analysed. URGENT_RESPONSE (collection NISAR_UR_L2) is the
# fastest-published product line: analysed only within its own stack and always labelled as such.
USABLE = {"PROVISIONAL", "VALIDATED", "URGENT_RESPONSE"}
CAVEATS = {
    "URGENT_RESPONSE": "Urgent-response product (NISAR_UR_L2): published fastest for events, not a validated "
                       "science release. Compare only with other urgent-response acquisitions.",
    "PROVISIONAL": "Provisional release: calibrated, partially validated.",
}
_CACHE: dict[str, tuple[float, dict]] = {}
SEARCH_TTL_S = 900


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def maturity_of(collection: str) -> str:
    if collection == "NISAR_UR_L2":
        return "URGENT_RESPONSE"
    return COLLECTION_MATURITY.get(collection, "OTHER")


def granule_record(p: dict, geometry: dict) -> dict:
    files = p.get("bytes") or {}
    return {
        "scene": p["sceneName"], "date": p["startTime"][:10], "start_time": p["startTime"],
        "track": p.get("pathNumber"), "frame": p.get("frameNumber"), "direction": p.get("flightDirection"),
        "collection": p.get("collectionName"), "maturity": maturity_of(p.get("collectionName", "")),
        "crid": p.get("crid"), "pols": list(p.get("mainBandPolarization") or []),
        "bandwidth": "+".join(p.get("rangeBandwidth") or []), "frame_coverage": p.get("frameCoverage"),
        "processing_date": p.get("processingDate"), "url": p.get("url"),
        "h5_bytes": files.get(p.get("fileName", ""), {}).get("bytes"), "footprint": geometry,
    }


def stack_key(g: dict) -> str:
    """Compatible = same track, pass, frame, bandwidth mode, processing release (CRID)
    and ASF collection (e.g. NISAR_UR_L2 urgent-response products can share a CRID
    with PROVISIONAL ones but are a different product line)."""
    base = f"t{g['track']}{(g['direction'] or '?')[0]}_f{g['frame']}_{g['bandwidth'].replace('+', '-')}_{g['crid']}"
    return base if g["maturity"] in ("PROVISIONAL", "VALIDATED") else f"{base}_{g['maturity'].lower()}"


def group_stacks(granules: list[dict]) -> list[dict]:
    stacks: dict[str, dict] = {}
    for g in granules:
        k = stack_key(g)
        s = stacks.setdefault(k, {"id": k, "track": g["track"], "direction": g["direction"], "frame": g["frame"],
                                  "bandwidth": g["bandwidth"], "crid": g["crid"], "maturity": g["maturity"],
                                  "usable": g["maturity"] in USABLE, "caveat": CAVEATS.get(g["maturity"]),
                                  "granules": []})
        s["granules"].append(g)
    out = []
    for s in stacks.values():
        gs = sorted({g["date"]: g for g in s["granules"]}.values(), key=lambda g: g["start_time"])  # one per date
        s["granules"] = gs
        s["dates"] = [g["date"] for g in gs]
        s["n_dates"] = len(gs)
        s["dual_pol_dates"] = [g["date"] for g in gs if "HV" in g["pols"]]
        s["latest"] = gs[-1]["date"] if gs else None
        out.append(s)
    # Most useful first: usable, then most recent latest date, then most dates.
    rank = {"VALIDATED": 3, "PROVISIONAL": 2, "URGENT_RESPONSE": 1}
    # Usable with a pair first, then newest data, then the more mature release, then the longer record.
    out.sort(key=lambda s: (s["usable"], s["n_dates"] >= 2, s["latest"] or "", rank.get(s["maturity"], 0),
                            s["n_dates"]), reverse=True)
    return out


def search_point(lat: float, lon: float, use_cache: bool = True) -> dict:
    """Query the ASF archive live for GCOV granules covering a point."""
    key = f"{lat:.4f},{lon:.4f}"
    if use_cache and key in _CACHE and time.time() - _CACHE[key][0] < SEARCH_TTL_S:
        return _CACHE[key][1]
    import asf_search as asf

    res = asf.search(dataset="NISAR", processingLevel="GCOV", intersectsWith=f"POINT({lon} {lat})", maxResults=2000)
    grans = {}
    for r in res:
        g = granule_record(r.properties, r.geometry)
        grans[(g["scene"], g["collection"])] = g  # dedupe
    granules = sorted(grans.values(), key=lambda g: g["start_time"])
    out = {"lat": lat, "lon": lon, "checked_utc": now_utc(),
           "source": "ASF Search API (asf_search), dataset NISAR, processingLevel GCOV",
           "n_granules": len(granules), "stacks": group_stacks(granules)}
    _CACHE[key] = (time.time(), out)
    return out


# ---- remote reading ---------------------------------------------------------

_DATE_RE = re.compile(r"_(\d{8})T(\d{6})")


def scene_epsg(f) -> int:
    pr = f[GRID]["projection"]
    if "epsg_code" in pr.attrs:
        return int(np.asarray(pr.attrs["epsg_code"]).item())
    return int(pr[()])


GRID_B = "/science/LSAR/GCOV/grids/frequencyB"  # 5 MHz side band: coarser (80 m) but tiny to read


def _chunk_ranges(ds, rs: slice, cs: slice) -> list[tuple[int, int]]:
    """Byte (offset, size) of every stored chunk of `ds` intersecting rows rs x cols cs."""
    if ds.chunks is None:
        return []
    ch_r, ch_c = ds.chunks
    out = []
    for r in range((rs.start // ch_r) * ch_r, rs.stop, ch_r):
        for c in range((cs.start // ch_c) * ch_c, cs.stop, ch_c):
            try:
                info = ds.id.get_chunk_info_by_coord((r, c))
            except Exception:  # noqa: BLE001  (chunk never written = fill value)
                continue
            if info.byte_offset is not None:
                out.append((info.byte_offset, info.size))
    return out


def read_window_multi(f, xlim: tuple, ylim: tuple, rf=None, grid: str = GRID, pols=("HH", "HV"), on_pol=None,
                      together: bool = False):
    """Read every available polarisation in the window ONCE, with the quality
    masks read a single time. If `rf` (RemoteFile) is given, each dataset's chunks
    are downloaded in parallel. Returns (x, y, {pol: (power, usable)}) or None.
    With `on_pol(pol, x, y, power, usable)`, each polarisation is handed over as soon as it
    is read and not kept, so only one full-resolution window is in memory at a time.
    With `together`, the chunks of the masks and every polarisation are fetched in one parallel
    batch first (faster: one wait instead of four, but every dataset's raw bytes are held at once)."""
    g = f[grid]
    x = g["xCoordinates"][()]
    y = g["yCoordinates"][()]
    xi = np.where((x >= xlim[0]) & (x <= xlim[1]))[0]
    yi = np.where((y >= ylim[0]) & (y <= ylim[1]))[0]
    if xi.size == 0 or yi.size == 0:
        return None
    rs, cs = slice(int(yi.min()), int(yi.max()) + 1), slice(int(xi.min()), int(xi.max()) + 1)
    batch = []
    if together and rf is not None:
        names = [n for n in ("mask", "inputDataExceptionMask", *(DIAGONAL_TERMS[p] for p in pols)) if n in g]
        batch = rf.prefetch([r for n in names for r in _chunk_ranges(g[n], rs, cs)], workers=16)

    def read(name):
        if batch:  # already fetched together
            return g[name][rs, cs]
        # One dataset at a time: fetch its chunks in parallel, read them, then free the raw
        # blocks. Holding every dataset's blocks at once (30-90 MB per acquisition) is what ran
        # a 512 MB server out of memory.
        ids = rf.prefetch(_chunk_ranges(g[name], rs, cs)) if rf is not None else []
        try:
            return g[name][rs, cs]
        finally:
            if rf is not None:
                rf.drop(ids)

    mk = read("mask") if "mask" in g else None
    ex = read("inputDataExceptionMask") if "inputDataExceptionMask" in g else None
    out = {}
    for pol in pols:
        term = DIAGONAL_TERMS[pol]
        if term not in g:
            continue
        p = read(term)
        ok = np.isfinite(p) & (p > 0) & quality_ok(mk, ex, pol)
        fv = g[term].attrs.get("_FillValue")
        if fv is not None and np.isfinite(fv):
            ok &= p != fv
        if on_pol is not None:
            on_pol(pol, x[cs], y[rs], p, ok)
            del p, ok
        else:
            out[pol] = (p, ok)
    if batch:
        rf.drop(batch)
    return x[cs], y[rs], out


def read_window(f, pol: str, xlim: tuple, ylim: tuple):
    """Return (x, y, power, usable) for the part of the frequency-A grid inside
    the projected limits, applying the verified GCOV quality masks."""
    g = f[GRID]
    term = DIAGONAL_TERMS[pol]
    if term not in g:
        return None
    x = g["xCoordinates"][()]
    y = g["yCoordinates"][()]
    xi = np.where((x >= xlim[0]) & (x <= xlim[1]))[0]
    yi = np.where((y >= ylim[0]) & (y <= ylim[1]))[0]
    if xi.size == 0 or yi.size == 0:
        return None
    rs, cs = slice(yi.min(), yi.max() + 1), slice(xi.min(), xi.max() + 1)
    p = g[term][rs, cs]
    mk = g["mask"][rs, cs] if "mask" in g else None
    ex = g["inputDataExceptionMask"][rs, cs] if "inputDataExceptionMask" in g else None
    fv = g[term].attrs.get("_FillValue")
    ok = np.isfinite(p) & (p > 0) & quality_ok(mk, ex, pol)
    if fv is not None and np.isfinite(fv):
        ok &= p != fv
    return x[cs], y[rs], p, ok


# ---- newest acquisitions worldwide ----------------------------------------------

_LATEST: dict[str, tuple[float, dict]] = {}
_LATEST_LOCK = threading.Lock()  # one archive search at a time: simultaneous page loads share its answer


def latest(days: float = 3, limit: int = 2000) -> dict:
    """The most recent NISAR GCOV products anywhere, straight from ASF, newest first.

    One acquisition can be listed more than once (an urgent-response product and a science
    product of the same pass); they are all returned, each with its own maturity.
    `truncated` is true when the period holds more products than `limit`."""
    key = f"{days}|{limit}"
    with _LATEST_LOCK:
        if key in _LATEST and time.time() - _LATEST[key][0] < 600:
            return _LATEST[key][1]
        import asf_search as asf
        from datetime import timedelta
        from shapely.geometry import shape

        start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        res = list(asf.search(dataset="NISAR", processingLevel="GCOV", start=start, maxResults=limit))
        items = {}
        for r in res:
            if not r.geometry:
                continue
            g = granule_record(r.properties, r.geometry)
            c = shape(r.geometry).centroid
            g["centroid"] = [round(c.x, 4), round(c.y, 4)]
            items[g["scene"]] = g
        gs = sorted(items.values(), key=lambda g: g["start_time"], reverse=True)
        out = {"checked_utc": now_utc(), "days": days, "n": len(gs), "limit": limit, "truncated": len(res) >= limit,
               "source": "ASF Search API (asf_search), dataset NISAR, processingLevel GCOV, newest first",
               "granules": gs}
        _LATEST[key] = (time.time(), out)
        return out
