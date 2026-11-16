"""Offline tests for the live backend logic (no network)."""
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "scripts"), str(ROOT / "scripts" / "processing")]

import nisar  # noqa: E402
from analyze import AnalysisError, validate_request, window_grid  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_signed_urls():
    """Each test starts without remembered archive URLs (they are shared across RemoteFiles)."""
    import remote_h5
    remote_h5._SIGNED.clear()
    yield
    remote_h5._SIGNED.clear()


def g(date, **kw):
    base = dict(scene=f"S{date}", date=date, start_time=f"{date}T00:00:00Z", track=83, frame=8,
                direction="ASCENDING", collection="NISAR_L2_GCOV_PROVISIONAL_V1", maturity="PROVISIONAL",
                crid="P05023", pols=["HH", "HV"], bandwidth="20+5", url="u", footprint=None)
    return {**base, **kw}


def test_stacks_split_by_release_collection_and_dedupe_dates():
    gs = [g("2026-06-19"), g("2026-07-01"), g("2026-07-01"),  # duplicate date counted once
          g("2026-10-29", collection="NISAR_L2_GCOV_V1", maturity="VALIDATED", crid="P05036"),
          g("2026-11-04", collection="NISAR_UR_L2", maturity="OTHER"),  # same CRID, other product line
          g("2025-12-01", collection="NISAR_L2_GCOV_BETA_V1", maturity="BETA", crid="X05009")]
    stacks = nisar.group_stacks(gs)
    by = {s["id"]: s for s in stacks}
    assert by["t83A_f8_20-5_P05023"]["dates"] == ["2026-06-19", "2026-07-01"]
    assert by["t83A_f8_20-5_P05023_other"]["usable"] is False
    assert by["t83A_f8_20-5_X05009_beta"]["usable"] is False
    assert stacks[0]["id"] == "t83A_f8_20-5_P05023"  # usable stack with >=2 dates ranked first


def test_validate_request_rules():
    validate_request([g("2026-06-19"), g("2026-07-01")], 20)
    with pytest.raises(AnalysisError):  # mixing releases
        validate_request([g("2026-06-19"), g("2026-10-29", crid="P05036", maturity="VALIDATED",
                                             collection="NISAR_L2_GCOV_V1")], 20)
    with pytest.raises(AnalysisError):  # BETA never analysed
        validate_request([g("2025-12-01", maturity="BETA"), g("2025-12-13", maturity="BETA")], 20)
    with pytest.raises(AnalysisError):  # one date only
        validate_request([g("2026-06-19")], 20)
    with pytest.raises(AnalysisError):  # window too large
        validate_request([g("2026-06-19"), g("2026-07-01")], 100)


def test_window_grid_is_centred_and_bounded():
    x0, y1, res, nx, ny = window_grid(12.85, 104.05, 20, 32648)
    assert res == 40 and nx == ny == 500
    from pyproj import Transformer
    cx, cy = Transformer.from_crs(4326, 32648, always_xy=True).transform(104.05, 12.85)
    assert abs((x0 + nx * res / 2) - cx) <= res and abs((y1 - ny * res / 2) - cy) <= res
    assert window_grid(0, 0, 40, 32631)[2] == 80  # larger window -> coarser cells, <= ~500 px


def test_remote_file_reads_ranges_through_cache(monkeypatch):
    import remote_h5

    data = bytes(range(256)) * 40  # 10240 bytes

    class Resp:
        def __init__(self, status, content=b"", headers=None, url="https://signed"):
            self.status_code, self.content, self.headers, self.url = status, content, headers or {}, url

        def raise_for_status(self):
            pass

    calls = []

    def fake_get(self, url, headers=None, **kw):
        rng = headers["Range"].split("=")[1]
        a, b = map(int, rng.split("-"))
        calls.append((a, b))
        return Resp(206, data[a:b + 1], {"Content-Range": f"bytes {a}-{b}/{len(data)}"})

    monkeypatch.setattr(remote_h5.requests.Session, "get", fake_get)
    f = remote_h5.RemoteFile("https://asf/x.h5", "tok", block_size=1000, max_blocks=4)
    assert f.size == len(data)
    f.seek(995)
    assert f.read(10) == data[995:1005]  # spans two blocks
    f.seek(995)
    f.read(10)
    assert len(calls) == 3  # resolve + 2 blocks; second read served from cache
    f.seek(-5, 2)
    assert f.read(100) == data[-5:]
    assert np.isclose(f.tell(), len(data))


def test_urgent_response_is_its_own_labelled_stack():
    assert nisar.maturity_of("NISAR_UR_L2") == "URGENT_RESPONSE"
    gs = [g("2026-11-02"), g("2026-11-14", collection="NISAR_UR_L2", maturity="URGENT_RESPONSE"),
          g("2026-11-26", collection="NISAR_UR_L2", maturity="URGENT_RESPONSE")]
    by = {s["id"]: s for s in nisar.group_stacks(gs)}
    ur = by["t83A_f8_20-5_P05023_urgent_response"]
    assert ur["usable"] and ur["caveat"] and ur["dates"] == ["2026-11-14", "2026-11-26"]
    validate_request(ur["granules"], 20)                      # UR-only stack may be analysed
    with pytest.raises(AnalysisError):                        # but never mixed with a science release
        validate_request([gs[0], gs[1]], 20)


def test_quick_detail_uses_coarser_grid():
    assert window_grid(12.85, 104.05, 20, 32648, "quick")[2] == 80


def test_recommendation_prefers_science_release_on_ties():
    gs = [g("2026-10-26", collection="NISAR_UR_L2", maturity="URGENT_RESPONSE", crid="P05036"),
          g("2026-11-07", collection="NISAR_UR_L2", maturity="URGENT_RESPONSE", crid="P05036"),
          g("2026-10-26", collection="NISAR_L2_GCOV_V1", maturity="VALIDATED", crid="P05036"),
          g("2026-11-07", collection="NISAR_L2_GCOV_V1", maturity="VALIDATED", crid="P05036")]
    assert nisar.group_stacks(gs)[0]["maturity"] == "VALIDATED"


def _fake_archive(monkeypatch, data, fail_first: int, status=503):
    """Fake CloudFront/S3: the first `fail_first` requests return `status`, then ranges work."""
    import remote_h5
    monkeypatch.setattr(remote_h5, "_backoff", lambda attempt, retry_after=None: 0)  # no real sleeping
    state = {"n": 0}

    class Resp:
        def __init__(self, code, content=b"", headers=None):
            self.status_code, self.content, self.headers, self.url = code, content, headers or {}, "https://signed/x?A-userid=someone"

    def fake_get(self, url, headers=None, **kw):
        state["n"] += 1
        if state["n"] <= fail_first:
            return Resp(status)
        a, b = map(int, headers["Range"].split("=")[1].split("-"))
        return Resp(206, data[a:b + 1], {"Content-Range": f"bytes {a}-{b}/{len(data)}"})

    monkeypatch.setattr(remote_h5.requests.Session, "get", fake_get)
    return remote_h5, state


def test_remote_file_retries_through_503s(monkeypatch):
    data = bytes(range(256)) * 8
    remote_h5, state = _fake_archive(monkeypatch, data, fail_first=4)
    f = remote_h5.RemoteFile("https://asf/x.h5", "tok", block_size=512)  # resolve survives 4x 503
    f.seek(100)
    assert f.read(50) == data[100:150]


def test_remote_file_gives_clean_error_when_archive_stays_down(monkeypatch):
    remote_h5, _ = _fake_archive(monkeypatch, b"x" * 100, fail_first=10 ** 6)
    with pytest.raises(remote_h5.ArchiveUnavailable) as ei:
        remote_h5.RemoteFile("https://asf/x.h5", "tok")
    assert "http" not in str(ei.value).lower().replace("http error", "") or "https://" not in str(ei.value)
    assert "userid" not in str(ei.value)


def test_public_error_hides_signed_urls():
    import app as backend_app
    e = RuntimeError("503 Server Error for url: https://d1.cloudfront.net/x.h5?A-userid=someone&Signature=abc")
    msg = backend_app.public_error(e)
    assert "userid" not in msg and "Signature" not in msg and "[archive URL hidden]" in msg


def test_latest_is_newest_first_and_says_when_truncated(monkeypatch):
    """The worldwide feed keeps every product (urgent-response and science versions of one pass),
    newest first, and reports when the period holds more than it fetched."""
    import types

    def result(scene, start, collection):
        props = {"sceneName": scene, "startTime": start, "pathNumber": 141, "frameNumber": 18,
                 "flightDirection": "ASCENDING", "collectionName": collection, "crid": "P05036",
                 "mainBandPolarization": ["HH", "HV"], "rangeBandwidth": ["20+5"]}
        geom = {"type": "Polygon", "coordinates": [[[90, 30], [92, 30], [92, 32], [90, 32], [90, 30]]]}
        return types.SimpleNamespace(properties=props, geometry=geom)

    found = [result("UR_A", "2026-11-13T10:00:00Z", "NISAR_UR_L2"),
             result("PR_A", "2026-11-13T10:00:00Z", "NISAR_L2_GCOV_V1"),
             result("UR_B", "2026-11-14T23:15:27Z", "NISAR_UR_L2")]
    calls = []

    def search(**kw):
        calls.append(kw)
        return found[:kw["maxResults"]]

    monkeypatch.setitem(sys.modules, "asf_search", types.SimpleNamespace(search=search))
    monkeypatch.setattr(nisar, "_LATEST", {})
    out = nisar.latest(3, limit=10)
    assert [g["scene"] for g in out["granules"]] == ["UR_B", "UR_A", "PR_A"] or \
        [g["scene"] for g in out["granules"]] == ["UR_B", "PR_A", "UR_A"]
    assert out["n"] == 3 and out["truncated"] is False
    assert {g["maturity"] for g in out["granules"]} == {"URGENT_RESPONSE", "VALIDATED"}
    assert out["granules"][0]["centroid"] == [91.0, 31.0]
    nisar.latest(3, limit=10)
    assert len(calls) == 1  # second call within 10 min is served from the cache
    assert nisar.latest(3, limit=2)["truncated"] is True


def test_every_answer_says_it_depends_on_the_origin():
    """A radar image is requested both by <img> tags and by the map, which reads it with CORS. Without
    "Vary: Origin" the browser hands the map a copy cached without the CORS header and the map stays empty."""
    import asyncio
    import app as backend_app

    def get(headers):
        sent = []
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
                 "path": "/api/health", "raw_path": b"/api/health", "query_string": b"", "root_path": "",
                 "headers": headers, "client": ("127.0.0.1", 1), "server": ("localhost", 8000)}

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(msg):
            sent.append(msg)

        asyncio.run(backend_app.app(scope, receive, send))
        start = next(m for m in sent if m["type"] == "http.response.start")
        assert start["status"] == 200
        return {k.decode().lower(): v.decode() for k, v in start["headers"]}

    plain = get([])
    assert plain.get("vary") == "Origin" and "access-control-allow-origin" not in plain
    cors = get([(b"origin", b"http://localhost:3000")])
    assert cors.get("vary") == "Origin" and cors["access-control-allow-origin"] == "http://localhost:3000"


def test_prefetch_fetches_exact_chunks_merging_neighbours(monkeypatch):
    """Chunks are downloaded byte-exact (no 1 MB block padding); close chunks share one request,
    and h5py's reads of them are then served from memory."""
    import remote_h5
    data = bytes(range(256)) * 400  # 102,400 bytes
    calls = []

    class Resp:
        def __init__(self, a, b):
            self.status_code, self.content, self.url = 206, data[a:b + 1], "https://signed"
            self.headers = {"Content-Range": f"bytes {a}-{b}/{len(data)}"}

    def fake_get(self, url, headers=None, **kw):
        a, b = map(int, headers["Range"].split("=")[1].split("-"))
        calls.append((a, b))
        return Resp(a, b)

    monkeypatch.setattr(remote_h5.requests.Session, "get", fake_get)
    f = remote_h5.RemoteFile("https://asf/x.h5", "tok", block_size=1000)
    f.MERGE_GAP = 100
    calls.clear()
    stored = f.prefetch([(2000, 300), (2350, 200), (90000, 500)])  # first two merge, third is far away
    assert sorted(calls) == [(2000, 2549), (90000, 90499)]
    assert sorted(stored) == [2000, 2350, 90000]
    calls.clear()
    for off, n in [(2000, 300), (2350, 200), (90000, 500)]:
        f.seek(off)
        assert f.read(n) == data[off:off + n]
    assert calls == []  # served from memory
    f.drop(stored)
    assert f.exact == {}


def test_signed_url_is_reused_for_a_second_file(monkeypatch):
    """Opening the same archive file again skips the ~2 s Earthdata redirect."""
    import remote_h5
    resolves = []

    class Resp:
        status_code, content, url = 206, b"x", "https://signed/x"
        headers = {"Content-Range": "bytes 0-0/1000"}

    def fake_get(self, url, headers=None, **kw):
        if "Authorization" in (headers or {}):
            resolves.append(url)
        return Resp()

    monkeypatch.setattr(remote_h5.requests.Session, "get", fake_get)
    a = remote_h5.RemoteFile("https://asf/y.h5", "tok")
    b = remote_h5.RemoteFile("https://asf/y.h5", "tok")
    assert len(resolves) == 1 and a.url == b.url == "https://signed/x" and b.size == 1000
