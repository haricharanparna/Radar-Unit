"""Read parts of a NISAR HDF5 file over HTTPS without downloading it.

ASF serves files behind Earthdata Login; an authenticated request is
redirected to a short-lived pre-signed URL. We resolve that URL once and
then issue HTTP Range requests for only the bytes h5py asks for, through a
small block cache. GCOV files are chunked (512x512) with paged metadata, so a
~20 km window needs a few MB instead of the whole 1.8 GB file.
"""
from __future__ import annotations

import io
import random
import threading
import time
from collections import OrderedDict

import requests

# The archive (CloudFront + S3) throttles bursts with HTTP 503 "Slow Down".
# One cap for ALL files read at once, plus retry with exponential back-off.
MAX_CONCURRENT_REQUESTS = 12
_GLOBAL_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)
RETRY_STATUS = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 7


# Pre-signed URLs from the Earthdata redirect, reused for a while: resolving costs ~2 s per file.
_SIGNED: dict[str, tuple[str, int, float]] = {}
SIGNED_REUSE_S = 1500  # shorter than the 1800 s after which a file refreshes its URL anyway


class ArchiveUnavailable(IOError):
    """NASA's archive kept refusing requests. The message never contains signed URLs."""


def _backoff(attempt: int, retry_after: str | None = None) -> float:
    if retry_after and retry_after.isdigit():
        return min(float(retry_after), 20.0)
    return min(0.5 * 2 ** attempt, 16.0) * (0.75 + random.random() / 2)  # jittered: 0.5, 1, 2, 4, 8, 16 s


class RemoteFile(io.RawIOBase):
    def __init__(self, url: str, token: str, block_size: int = 1024 * 1024, max_blocks: int = 128):
        super().__init__()
        self.session = requests.Session()
        self.token = token
        self.block_size = block_size
        self.max_blocks = max_blocks
        self.blocks: OrderedDict[int, bytes] = OrderedDict()
        self.exact: dict[int, bytes] = {}  # prefetched byte ranges, by start offset (exactly what h5py asks for)
        self.lock = threading.Lock()
        self.pos = 0
        self.bytes_fetched = 0
        self.n_requests = 0
        self.orig_url = url
        self._resolve()

    def _resolve(self, reuse: bool = True):
        hit = _SIGNED.get(self.orig_url) if reuse else None
        if hit and time.time() - hit[2] < SIGNED_REUSE_S:
            self.url, self.size, self.resolved_at = hit
            return
        name = self.orig_url.rsplit("/", 1)[-1]
        for attempt in range(MAX_ATTEMPTS):
            try:
                with _GLOBAL_SLOTS:
                    r = self.session.get(self.orig_url, allow_redirects=True, timeout=60,
                                         headers={"Authorization": f"Bearer {self.token}", "Range": "bytes=0-0"})
            except requests.RequestException:
                time.sleep(_backoff(attempt))
                continue
            if r.status_code in RETRY_STATUS:
                time.sleep(_backoff(attempt, r.headers.get("Retry-After")))
                continue
            break
        else:
            raise ArchiveUnavailable(f"NASA's archive is busy (repeated HTTP errors) while opening {name}; "
                                     "please try again in a minute")
        if r.status_code in (401, 403):
            raise PermissionError(f"Earthdata refused access to {name} (HTTP {r.status_code}); check the token")
        if r.status_code not in (200, 206):
            raise ArchiveUnavailable(f"NASA's archive returned HTTP {r.status_code} for {name}")
        self.url = r.url  # pre-signed URL after redirects
        cr = r.headers.get("Content-Range", "")
        self.size = int(cr.split("/")[-1]) if "/" in cr else int(r.headers["Content-Length"])
        self.resolved_at = time.time()
        _SIGNED[self.orig_url] = (self.url, self.size, self.resolved_at)

    def _get_block(self, i: int) -> bytes:
        with self.lock:
            if i in self.blocks:
                self.blocks.move_to_end(i)
                return self.blocks[i]
        start = i * self.block_size
        data = self._fetch(start, min(start + self.block_size, self.size) - 1)
        with self.lock:
            self.blocks[i] = data
            if len(self.blocks) > self.max_blocks:
                self.blocks.popitem(last=False)
        return data

    def _fetch(self, start: int, end: int) -> bytes:
        """One HTTP Range request for bytes start..end (inclusive), with retries."""
        status = None
        for attempt in range(MAX_ATTEMPTS):
            if time.time() - self.resolved_at > 1800:  # pre-signed URLs expire; refresh early
                self._resolve(reuse=False)
            try:
                with _GLOBAL_SLOTS:
                    r = self.session.get(self.url, headers={"Range": f"bytes={start}-{end}"}, timeout=120)
            except requests.RequestException:
                status = "network error"
                time.sleep(_backoff(attempt))
                continue
            status = r.status_code
            if r.status_code == 206:
                break
            if r.status_code in (401, 403):  # signed URL expired
                self._resolve(reuse=False)
                continue
            if r.status_code in RETRY_STATUS:
                time.sleep(_backoff(attempt, r.headers.get("Retry-After")))
                continue
            raise ArchiveUnavailable(f"NASA's archive returned HTTP {r.status_code} while reading data")
        else:
            raise ArchiveUnavailable(f"NASA's archive is busy ({status} after {MAX_ATTEMPTS} attempts); "
                                     "please try again in a minute")
        data = r.content
        with self.lock:
            self.bytes_fetched += len(data)
            self.n_requests += 1
        return data

    MERGE_GAP = 64 * 1024        # chunks closer than this are fetched in one request
    MAX_SEGMENT = 8 * 1024 ** 2  # but no request larger than this

    def prefetch(self, ranges: list[tuple[int, int]], workers: int = 8) -> list[int]:
        """Fetch exactly the given (offset, size) byte ranges (HDF5 chunks) in parallel, merging
        neighbours into one request, so the following h5py reads are served from memory instead of
        one HTTP round trip at a time and no bytes outside the chunks are downloaded. Returns the
        offsets it stored; pass them to `drop` once read, so a small server does not run out of memory."""
        want = sorted({(off, size) for off, size in ranges if size > 0 and off not in self.exact})
        if not want:
            return []
        segments: list[list[tuple[int, int]]] = []  # each: chunks fetched by one request
        for off, size in want:
            if segments:
                s0 = segments[-1][0][0]; e0 = segments[-1][-1][0] + segments[-1][-1][1]
                if off - e0 <= self.MERGE_GAP and off + size - s0 <= self.MAX_SEGMENT:
                    segments[-1].append((off, size)); continue
            segments.append([(off, size)])

        def get(seg):
            s0 = seg[0][0]; e0 = max(o + n for o, n in seg)
            data = self._fetch(s0, e0 - 1)
            with self.lock:
                for o, n in seg:
                    self.exact[o] = data[o - s0:o - s0 + n]

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(workers, len(segments))) as ex:
            list(ex.map(get, segments))
        return [o for o, _ in want]

    def drop(self, offsets: list[int]):
        """Forget prefetched ranges that have been read."""
        with self.lock:
            for o in offsets:
                self.exact.pop(o, None)

    def release(self):
        """Free every cached byte (the file stays usable; bytes are fetched again if needed)."""
        with self.lock:
            self.blocks.clear()
            self.exact.clear()

    # --- io.RawIOBase API used by h5py ---
    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        else:
            self.pos = self.size + offset
        return self.pos

    def readinto(self, b):
        n = len(b)
        if self.pos >= self.size or n == 0:
            return 0
        n = min(n, self.size - self.pos)
        out = memoryview(b)
        hit = self.exact.get(self.pos)
        if hit is not None and len(hit) >= n:  # a prefetched chunk, read exactly as h5py asks
            out[:n] = hit[:n]
            self.pos += n
            return n
        done = 0
        while done < n:
            i, off = divmod(self.pos + done, self.block_size)
            blk = self._get_block(i)
            take = min(n - done, len(blk) - off)
            out[done:done + take] = blk[off:off + take]
            done += take
        self.pos += n
        return n
