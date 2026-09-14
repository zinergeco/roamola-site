"""BUILD.md §8.1. Flow 1 of 9.

Raw is snapshotted to S3 BEFORE parsing and is never overwritten -- this is
what makes every pipeline run replayable, which M2's "done when" criterion
depends on (a run must be replayable from raw and a bad batch auto-blocked).
"""

from datetime import datetime, timezone


def ingest(source_slug: str) -> None:
    # source = get_source(source_slug)
    # assert source.active, f"{source_slug} is disabled"
    #
    # raw = connector(source_slug).fetch()
    #
    # snapshot_key = f"raw/{source_slug}/{utcnow():%Y/%m/%d/%H%M%S}.json.gz"
    # put_object(snapshot_key, raw)
    #
    # staged = parse(raw, schema_version=source.schema_version)
    #
    # check_row_count_delta(source_slug, len(staged), tolerance=0.25)
    # check_distribution_shift(source_slug, staged, tolerance=0.15)
    #
    # stage(staged, source_id=source.id, retrieved_at=utcnow())
    raise NotImplementedError("M2: wire up the first connector against docs/SOURCES.md")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
