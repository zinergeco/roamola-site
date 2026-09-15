"""BUILD.md §0 rule 2 / §8 -- the provenance register and staging helpers.

"No orphan data enters the graph. If a value cannot be attributed, it
cannot be published." Every row this module writes carries a source_id.

Mirrors the find-or-create pattern already proven live in
apps/web/app/admin/system-check/actions.ts (M1's acceptance test) --
same table shapes, same semantics, just Postgres via psycopg instead of
Drizzle, because `apps/web` may never import from `services/*` and vice
versa (BUILD.md §2's boundary rule).
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator


class ProvenanceError(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def connect():
    try:
        import psycopg
    except ImportError as err:  # pragma: no cover
        raise ProvenanceError("psycopg is not installed -- see requirements.txt") from err

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise ProvenanceError("DATABASE_URL is not set -- see .env.example")

    with psycopg.connect(dsn, autocommit=False) as conn:
        yield conn


@dataclass(frozen=True)
class SourceRef:
    id: int
    slug: str


@dataclass(frozen=True)
class PlaceRef:
    id: int
    slug: str
    newly_inserted: bool


def get_or_create_source(
    conn,
    *,
    slug: str,
    name: str,
    url: str,
    licence: str,
    commercial_use: bool,
    redistributable: bool = False,
    refresh_interval: str = "1 day",
) -> SourceRef:
    """Upsert on slug, same as system-check's `onConflictDoUpdate`."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO source (slug, name, url, licence, commercial_use,
                                 redistributable, refresh_interval,
                                 last_success_at, active)
            VALUES (%s, %s, %s, %s, %s, %s, %s::interval, %s, true)
            ON CONFLICT (slug) DO UPDATE SET last_success_at = EXCLUDED.last_success_at
            RETURNING id
            """,
            (slug, name, url, licence, commercial_use, redistributable, refresh_interval, utcnow()),
        )
        (source_id,) = cur.fetchone()
    return SourceRef(id=source_id, slug=slug)


def get_or_create_place(
    conn,
    *,
    slug: str,
    parent_id: int | None,
    place_type: str,
    canonical_name: str,
    country_code: str,
    timezone_name: str,
    lon: float,
    lat: float,
    source_id: int,
) -> PlaceRef:
    """Find-or-create keyed on (parent_id, slug) -- the same uniqueness the
    schema enforces (`place_parent_slug_unique`) and the same key
    system-check's own place step uses."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM place WHERE slug = %s AND parent_id IS NOT DISTINCT FROM %s LIMIT 1",
            (slug, parent_id),
        )
        row = cur.fetchone()
        if row:
            return PlaceRef(id=row[0], slug=slug, newly_inserted=False)

        centroid_wkt = f"SRID=4326;POINT({lon} {lat})"
        cur.execute(
            """
            INSERT INTO place (parent_id, type, slug, canonical_name,
                                country_code, timezone, centroid, source_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (parent_id, place_type, slug, canonical_name, country_code, timezone_name, centroid_wkt, source_id, utcnow()),
        )
        (place_id,) = cur.fetchone()
    return PlaceRef(id=place_id, slug=slug, newly_inserted=True)


def stage_signal(
    conn,
    *,
    entity_type: str,
    entity_id: int,
    metric: str,
    value: float,
    unit: str,
    observed_at: datetime,
    source_id: int,
    confidence: float = 1.00,
) -> int:
    """Signals are append-only (BUILD.md §0 rule 3) -- this only ever
    INSERTs. There is no update_signal function anywhere in this codebase,
    on purpose; the DB trigger from migration 0001 would reject one anyway."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO signal (entity_type, entity_id, metric, value, unit,
                                 observed_at, source_id, confidence)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (entity_type, entity_id, metric, value, unit, observed_at, source_id, confidence),
        )
        (signal_id,) = cur.fetchone()
    return signal_id
