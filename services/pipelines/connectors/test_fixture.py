"""SYNTHETIC TEST CONNECTOR -- not a real data source.

docs/SOURCES.md is deliberately still empty: choosing launch markets and
vetting real geographic/regulatory/climate sources is Day 1-30 business
work (master plan §32), not something to fabricate from this seat. Every
place/name/number this connector returns is fictional and clearly marked
as such (country_code "ZZ", slugs prefixed `test-`) -- it exists only to
let the pipeline mechanics themselves (ingest -> snapshot -> validate ->
stage, replay from raw, anomaly blocking) be proven end to end, which is
the actual, literal content of M2's "done when" test in BUILD.md §15:

    "a pipeline run is fully replayable from raw and a bad batch is
    blocked automatically"

Neither sentence requires real data -- only a real pipeline. When a real
first connector is built against a vetted, licensed source, it goes in a
sibling module here and gets a row in docs/SOURCES.md; this file should
keep existing alongside it as the fixture the pipeline's own tests run
against, the same way system-check's Postgres fixture rows keep existing
alongside real ones.
"""

from __future__ import annotations

import json

SOURCE_SLUG = "test-fixture"

_SOURCE_META = {
    "slug": SOURCE_SLUG,
    "name": "Synthetic pipeline test fixture (not a real source)",
    "url": "https://github.com/zinergeco/roamola-site/blob/main/services/pipelines/connectors/test_fixture.py",
    "licence": "internal-test",
    "commercial_use": False,
}

_PLACES = [
    {
        "slug": "test-country",
        "parent_slug": None,
        "type": "country",
        "canonical_name": "Test Country (synthetic fixture)",
        "country_code": "ZZ",
        "timezone": "UTC",
        "lon": 0.0,
        "lat": 0.0,
    },
    {
        "slug": "test-city-a",
        "parent_slug": "test-country",
        "type": "city",
        "canonical_name": "Test City A (synthetic fixture)",
        "country_code": "ZZ",
        "timezone": "UTC",
        "lon": 1.0,
        "lat": 1.0,
    },
    {
        "slug": "test-city-b",
        "parent_slug": "test-country",
        "type": "city",
        "canonical_name": "Test City B (synthetic fixture)",
        "country_code": "ZZ",
        "timezone": "UTC",
        "lon": 2.0,
        "lat": 2.0,
    },
]

# Normal, in-range readings -- what a healthy ingest run looks like.
_SIGNALS_CLEAN = [
    {"place_slug": "test-city-a", "metric": "sea_temp_c", "value": 22.5, "unit": "c"},
    {"place_slug": "test-city-a", "metric": "adr", "value": 120.0, "unit": "usd"},
    {"place_slug": "test-city-b", "metric": "sea_temp_c", "value": 18.0, "unit": "c"},
    {"place_slug": "test-city-b", "metric": "adr", "value": 95.0, "unit": "usd"},
]

# Deliberately poisoned: test-city-a's sea_temp_c is physically impossible
# (150C), which lib.anomaly.check_impossible_temp's rule (BUILD.md §8.3)
# must catch and halt on. This is the batch M2's acceptance test uses to
# prove "a bad batch is blocked automatically."
_SIGNALS_POISONED = [
    {"place_slug": "test-city-a", "metric": "sea_temp_c", "value": 150.0, "unit": "c"},
    {"place_slug": "test-city-a", "metric": "adr", "value": 120.0, "unit": "usd"},
    {"place_slug": "test-city-b", "metric": "sea_temp_c", "value": 18.0, "unit": "c"},
    {"place_slug": "test-city-b", "metric": "adr", "value": 95.0, "unit": "usd"},
]


def fetch(*, poisoned: bool = False) -> bytes:
    """Returns raw bytes exactly as a real connector's `.fetch()` would --
    ingest.py snapshots this to S3 before parsing, never after."""
    payload = {
        "source": _SOURCE_META,
        "places": _PLACES,
        "signals": _SIGNALS_POISONED if poisoned else _SIGNALS_CLEAN,
    }
    return json.dumps(payload, sort_keys=True).encode("utf-8")


def parse(raw: bytes) -> dict:
    """The `parse(raw, schema_version=...)` step from BUILD.md §8.1 -- for
    this fixture the wire format already is the staged shape, so parsing
    is just a JSON decode. A real connector's parse() earns its keep
    translating a source's native format into this same {source, places,
    signals} shape."""
    return json.loads(raw.decode("utf-8"))
