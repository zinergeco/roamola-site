"""BUILD.md §8.1 -- raw snapshotting to S3.

"Snapshot raw to S3 BEFORE parsing. Raw is never overwritten. This is what
makes every pipeline run replayable" -- and replayability from raw is half
of M2's own "done when" test (BUILD.md §15).

S3-compatible only: this talks to whatever endpoint S3_ENDPOINT points at
(a self-hosted MinIO on Coolify per docs/DECISIONS.md's self-host-everything
decision, or real AWS S3/B2/etc in another environment) via boto3's generic
S3 client. Nothing here is AWS-specific.
"""

from __future__ import annotations

import gzip
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache


class SnapshotError(RuntimeError):
    """Raised when raw storage is unreachable or misconfigured."""


@dataclass(frozen=True)
class Snapshot:
    key: str
    raw: bytes


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def snapshot_key(source_slug: str, at: datetime | None = None) -> str:
    """BUILD.md §8.1's exact key shape: raw/{source_slug}/{utcnow():%Y/%m/%d/%H%M%S}.json.gz"""
    at = at or utcnow()
    return f"raw/{source_slug}/{at:%Y/%m/%d/%H%M%S}.json.gz"


@lru_cache(maxsize=1)
def _client():
    try:
        import boto3
    except ImportError as err:  # pragma: no cover
        raise SnapshotError("boto3 is not installed -- see requirements.txt") from err

    endpoint = os.environ.get("S3_ENDPOINT") or None
    bucket = os.environ.get("S3_BUCKET")
    access_key = os.environ.get("S3_ACCESS_KEY_ID")
    secret_key = os.environ.get("S3_SECRET_ACCESS_KEY")
    if not bucket or not access_key or not secret_key:
        raise SnapshotError(
            "S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY must be set "
            "-- see .env.example. S3_ENDPOINT blank means AWS S3 itself; set "
            "it to point at a self-hosted MinIO instead."
        )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        # MinIO and most self-hosted S3-compatible stores expect path-style
        # addressing (bucket in the path, not a bucket.subdomain host).
        config=boto3.session.Config(s3={"addressing_style": "path"}) if endpoint else None,
    )


def _bucket() -> str:
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        raise SnapshotError("S3_BUCKET is not set -- see .env.example")
    return bucket


def put_raw(source_slug: str, raw: bytes, *, at: datetime | None = None) -> str:
    """Gzip and write `raw` to a fresh, never-overwritten key. Returns the key."""
    key = snapshot_key(source_slug, at)
    body = gzip.compress(raw)
    _client().put_object(Bucket=_bucket(), Key=key, Body=body, ContentType="application/octet-stream")
    return key


def get_raw(key: str) -> bytes:
    """Fetch and gunzip a previously-stored raw snapshot. This is the whole
    replay mechanism: `flows.ingest.ingest(..., replay_from=key)` calls this
    instead of hitting the live connector, so a past run can be reproduced
    byte-for-byte from what was actually received at the time."""
    obj = _client().get_object(Bucket=_bucket(), Key=key)
    body = obj["Body"].read()
    return gzip.decompress(body)


def bucket_exists() -> bool:
    try:
        _client().head_bucket(Bucket=_bucket())
        return True
    except Exception:
        return False


def ensure_bucket() -> None:
    """Idempotent bucket creation -- mirrors container-init.mjs's `CREATE
    TABLE IF NOT EXISTS` pattern for ClickHouse: safe to call on every run."""
    client = _client()
    bucket = _bucket()
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        client.create_bucket(Bucket=bucket)
