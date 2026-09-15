"""BUILD.md §8.1. Flow 1 of 9.

Raw is snapshotted to S3 BEFORE parsing and is never overwritten -- this is
what makes every pipeline run replayable, which M2's "done when" criterion
depends on (a run must be replayable from raw and a bad batch auto-blocked).

Order matters and mirrors BUILD.md §8.1 exactly:
  1. fetch (or replay) raw bytes
  2. snapshot raw to S3 -- happens even for a batch that will later be
     rejected, since the whole point of snapshotting is forensic: you
     need the raw bytes precisely *because* something might go wrong
     downstream of them.
  3. parse
  4. validate / anomaly-check -- raises and halts before anything touches
     Postgres. A poisoned batch stages nothing, full stop.
  5. stage into Postgres, inside one transaction.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime

from connectors import connector
from lib.anomaly import StagedRecord, check_batch
from lib.provenance import connect, get_or_create_place, get_or_create_source, stage_signal, utcnow
from lib.snapshot import get_raw, put_raw


class IngestError(RuntimeError):
    pass


@dataclass(frozen=True)
class IngestResult:
    source_slug: str
    snapshot_key: str
    replayed: bool
    source_id: int
    place_ids: dict[str, int] = field(default_factory=dict)
    signal_ids: list[int] = field(default_factory=list)
    content_hash: str = ""


def _content_hash(staged: dict) -> str:
    """Hash of the parsed (post-parse, pre-stage) payload -- NOT of any DB
    row, since signal is append-only and a replay of the same raw bytes is
    expected to insert fresh rows (each ingest is a new observation), not
    to dedupe. This hash is what scripts/m2_check.py compares between an
    original run and a replay of its own snapshot, to prove raw storage
    and parsing are faithfully reproducible -- the actual content of
    BUILD.md's "replayable from raw" requirement."""
    canonical = json.dumps(staged, sort_keys=True).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def ingest(
    source_slug: str,
    *,
    replay_from: str | None = None,
    poisoned: bool = False,
    at: datetime | None = None,
) -> IngestResult:
    """Run the ingest flow for `source_slug`.

    replay_from: an S3 snapshot key from a previous run. When set, raw
    bytes are re-fetched from that stored snapshot instead of calling the
    live connector -- this IS the replay mechanism BUILD.md's M2 acceptance
    test requires, not a separate code path bolted on afterwards.

    poisoned: only meaningful for connectors that support it (test_fixture
    does, for the M2 anomaly-blocking proof). A real connector ignores it.
    """
    conn_module = connector(source_slug)

    if replay_from:
        raw = get_raw(replay_from)
        snapshot_key = replay_from
        replayed = True
    else:
        fetch_kwargs = {"poisoned": poisoned} if source_slug == "test-fixture" else {}
        raw = conn_module.fetch(**fetch_kwargs)
        snapshot_key = put_raw(source_slug, raw, at=at)
        replayed = False

    staged = conn_module.parse(raw)

    records = [
        StagedRecord(
            entity_type="place",
            entity_id=s["place_slug"],
            metric=s["metric"],
            value=s["value"],
            unit=s["unit"],
        )
        for s in staged["signals"]
    ]

    # Raises AnomalyDetected here halts the flow before any Postgres write
    # -- see the module docstring on why that ordering is not optional.
    check_batch(records, source_slug=source_slug)

    with connect() as conn:
        source_meta = staged["source"]
        source_ref = get_or_create_source(
            conn,
            slug=source_meta["slug"],
            name=source_meta["name"],
            url=source_meta["url"],
            licence=source_meta["licence"],
            commercial_use=source_meta["commercial_use"],
        )

        place_ids: dict[str, int] = {}
        for p in staged["places"]:
            parent_id = place_ids.get(p["parent_slug"]) if p.get("parent_slug") else None
            place_ref = get_or_create_place(
                conn,
                slug=p["slug"],
                parent_id=parent_id,
                place_type=p["type"],
                canonical_name=p["canonical_name"],
                country_code=p["country_code"],
                timezone_name=p["timezone"],
                lon=p["lon"],
                lat=p["lat"],
                source_id=source_ref.id,
            )
            place_ids[p["slug"]] = place_ref.id

        signal_ids: list[int] = []
        observed_at = at or utcnow()
        for s in staged["signals"]:
            entity_id = place_ids[s["place_slug"]]
            signal_id = stage_signal(
                conn,
                entity_type="place",
                entity_id=entity_id,
                metric=s["metric"],
                value=s["value"],
                unit=s["unit"],
                observed_at=observed_at,
                source_id=source_ref.id,
            )
            signal_ids.append(signal_id)

        conn.commit()

    return IngestResult(
        source_slug=source_slug,
        snapshot_key=snapshot_key,
        replayed=replayed,
        source_id=source_ref.id,
        place_ids=place_ids,
        signal_ids=signal_ids,
        content_hash=_content_hash(staged),
    )
