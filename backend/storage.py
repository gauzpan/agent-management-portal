"""Blob storage for application documents (PDFs, images).

Render's container filesystem is ephemeral — anything written at runtime is lost
on every deploy/restart. So runtime-written files (intake/upload PDFs, generated
agreements, applicant documents) go through this tiny name->bytes interface,
which has two backends chosen by environment:

- Supabase Storage — when SUPABASE_URL + SUPABASE_SERVICE_KEY are set. Persists
  across deploys. Uses the Storage REST API over stdlib urllib (no extra deps).
- Local disk (backend/app-forms/) — the default for development.

Static assets that ship inside the image (e.g. the blank application form
template) are NOT managed here — they persist as part of the deploy.
"""
from __future__ import annotations

import os
import tempfile
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

_LOCAL_DIR = Path(__file__).resolve().parent / "app-forms"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY")
                or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "")
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "app-forms")


def using_supabase() -> bool:
    """True when Supabase Storage is configured (else local disk)."""
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _object_url(name: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{name}"


def _request(name: str, *, method: str, data: Optional[bytes] = None,
             content_type: Optional[str] = None) -> bytes:
    headers = {"Authorization": f"Bearer {SUPABASE_KEY}"}
    if content_type:
        headers["Content-Type"] = content_type
    if method == "POST":
        headers["x-upsert"] = "true"  # overwrite if the object already exists
    req = urllib.request.Request(_object_url(name), data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def ensure() -> None:
    """Prepare the local store (no-op for Supabase). Called at app startup."""
    if not using_supabase():
        _LOCAL_DIR.mkdir(exist_ok=True)


def save(name: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Persist `data` under `name`, overwriting any existing object."""
    if using_supabase():
        _request(name, method="POST", data=data, content_type=content_type)
    else:
        ensure()
        (_LOCAL_DIR / name).write_bytes(data)


def _local_read(name: str) -> Optional[bytes]:
    p = _LOCAL_DIR / name
    return p.read_bytes() if p.exists() else None


def read(name: Optional[str]) -> Optional[bytes]:
    """Return the bytes stored under `name`, or None if it does not exist.

    In Supabase mode, falls back to the local `app-forms/` directory so seeded
    showcase PDFs shipped inside the image (which never land in the bucket) still
    resolve. Runtime uploads always live in the bucket."""
    if not name:
        return None
    if using_supabase():
        try:
            return _request(name, method="GET")
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return _local_read(name)  # shipped static asset fallback
            raise
    return _local_read(name)


def exists(name: Optional[str]) -> bool:
    """True when an object is stored under `name` (bucket or shipped fallback)."""
    if not name:
        return False
    if using_supabase():
        return read(name) is not None
    return (_LOCAL_DIR / name).exists()


def delete(name: Optional[str]) -> None:
    """Remove the object under `name` if present (best-effort)."""
    if not name:
        return
    if using_supabase():
        try:
            _request(name, method="DELETE")
        except urllib.error.HTTPError as err:
            if err.code != 404:
                raise
    else:
        (_LOCAL_DIR / name).unlink(missing_ok=True)


@contextmanager
def open_path(name: Optional[str]) -> Iterator[Optional[Path]]:
    """Yield a real filesystem path for `name` (for libraries that need a path),
    or None if the object is missing. For Supabase the object is downloaded to a
    temporary file that is cleaned up on exit; for local disk the real path is
    yielded directly."""
    if not name:
        yield None
        return
    if not using_supabase():
        p = _LOCAL_DIR / name
        yield p if p.exists() else None
        return
    blob = read(name)
    if blob is None:
        yield None
        return
    suffix = Path(name).suffix
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(blob)
        tmp.close()
        yield Path(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
