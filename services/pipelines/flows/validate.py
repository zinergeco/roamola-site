"""BUILD.md §8.3. Flow 3 of 9.

Any anomaly above tolerance halts publishing for the affected template. It
does not warn and continue -- halting is cheap, publishing wrong data is
not.

`ANOMALY_RULES` below is the declarative rule table exactly as BUILD.md
§8.3 states it, kept verbatim so the spec and the code can be diffed
against each other. The actual executable checks -- the ones ingest.py
calls, and the ones M2's acceptance test (scripts/m2_check.py) exercises
against a deliberately poisoned batch -- live in lib/anomaly.py, since a
lambda table alone doesn't have anywhere to accumulate cross-run state
(the previous row count / previous price a "jump" is measured against).
"""

from lib.anomaly import AnomalyDetected, StagedRecord, check_batch

ANOMALY_RULES = [
    ("price_jump", lambda s: abs(s.pct_change) > 0.60),
    ("impossible_temp", lambda s: not -50 < s.value < 60),
    ("null_surge", lambda b: b.null_rate > 0.20),
    ("stale_source", lambda src: src.days_since_success > src.refresh_days * 2),
]

__all__ = ["ANOMALY_RULES", "AnomalyDetected", "StagedRecord", "check_batch"]


def validate(records, *, source_slug: str, previous_prices=None, previous_count=None) -> None:
    """Thin flow-level wrapper around lib.anomaly.check_batch -- the actual
    validate step in the ingest -> normalise -> validate sequence."""
    check_batch(
        records,
        source_slug=source_slug,
        previous_prices=previous_prices,
        previous_count=previous_count,
    )
