"""BUILD.md §8.3 -- validate. "Any anomaly above tolerance halts publishing
for the affected template. It does not warn and continue. Halting is
cheap, publishing wrong data is not."

This is the real evaluator behind the `ANOMALY_RULES` table that already
existed as a stub in flows/validate.py -- that file keeps the table (it's
the declarative source of truth cited by BUILD.md §8.3 verbatim); this
module is what actually runs it and raises.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence


class AnomalyDetected(RuntimeError):
    """Raised to halt a pipeline run. Caught nowhere upstream on purpose --
    an uncaught exception stopping the flow *is* "halts publishing"."""

    def __init__(self, rule: str, detail: str):
        self.rule = rule
        self.detail = detail
        super().__init__(f"anomaly rule '{rule}' triggered: {detail}")


@dataclass(frozen=True)
class StagedRecord:
    """One row about to be staged -- shape-compatible with what a connector's
    parsed output looks like before it becomes a `signal` row."""

    entity_type: str
    entity_id: str
    metric: str
    value: float
    unit: str


# BUILD.md §8.3, verbatim rule set. Kept here (not re-derived) so the code
# and the spec can be diffed against each other directly.
PRICE_JUMP_TOLERANCE = 0.60
IMPOSSIBLE_TEMP_RANGE = (-50, 60)
NULL_SURGE_TOLERANCE = 0.20
ROW_COUNT_DELTA_TOLERANCE = 0.25
DISTRIBUTION_SHIFT_TOLERANCE = 0.15


def check_impossible_temp(records: Iterable[StagedRecord]) -> None:
    lo, hi = IMPOSSIBLE_TEMP_RANGE
    for r in records:
        if r.metric == "sea_temp_c" and not (lo < r.value < hi):
            raise AnomalyDetected(
                "impossible_temp",
                f"{r.entity_type}:{r.entity_id} {r.metric}={r.value}{r.unit} outside ({lo}, {hi})",
            )


def check_price_jump(records: Iterable[StagedRecord], *, previous: dict[tuple[str, str, str], float]) -> None:
    """previous maps (entity_type, entity_id, metric) -> last known value."""
    for r in records:
        if r.metric != "adr":
            continue
        prev = previous.get((r.entity_type, r.entity_id, r.metric))
        if prev is None or prev == 0:
            continue
        pct_change = abs(r.value - prev) / abs(prev)
        if pct_change > PRICE_JUMP_TOLERANCE:
            raise AnomalyDetected(
                "price_jump",
                f"{r.entity_type}:{r.entity_id} {r.metric} moved {pct_change:.0%} "
                f"({prev} -> {r.value}), tolerance is {PRICE_JUMP_TOLERANCE:.0%}",
            )


def check_null_surge(records: Sequence[StagedRecord | None]) -> None:
    if not records:
        return
    null_rate = sum(1 for r in records if r is None) / len(records)
    if null_rate > NULL_SURGE_TOLERANCE:
        raise AnomalyDetected(
            "null_surge",
            f"{null_rate:.0%} of the batch is null, tolerance is {NULL_SURGE_TOLERANCE:.0%}",
        )


def check_row_count_delta(source_slug: str, new_count: int, *, previous_count: int | None) -> None:
    if previous_count is None or previous_count == 0:
        return
    delta = abs(new_count - previous_count) / previous_count
    if delta > ROW_COUNT_DELTA_TOLERANCE:
        raise AnomalyDetected(
            "row_count_delta",
            f"{source_slug}: row count moved {delta:.0%} ({previous_count} -> {new_count}), "
            f"tolerance is {ROW_COUNT_DELTA_TOLERANCE:.0%}",
        )


def check_batch(
    records: Sequence[StagedRecord],
    *,
    source_slug: str,
    previous_prices: dict[tuple[str, str, str], float] | None = None,
    previous_count: int | None = None,
) -> None:
    """Run every applicable rule. Raises AnomalyDetected (halting the caller)
    on the first violation -- BUILD.md §8.3 is explicit this must not warn
    and continue."""
    check_row_count_delta(source_slug, len(records), previous_count=previous_count)
    check_impossible_temp(records)
    check_price_jump(records, previous=previous_prices or {})
