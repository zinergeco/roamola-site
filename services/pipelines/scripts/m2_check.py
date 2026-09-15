#!/usr/bin/env python3
"""BUILD.md §15's own M2 acceptance test, run live -- the pipeline
equivalent of apps/web/app/admin/system-check for M1.

    "Done when: a pipeline run is fully replayable from raw and a bad
    batch is blocked automatically."

This runs exactly that, against whatever DATABASE_URL / S3_* env point at
(production Postgres + MinIO when run from the deployed pipelines
container on Coolify's internal network, same pattern as M1's system-check
running inside the deployed Next.js container). Uses the synthetic
`test-fixture` connector -- see connectors/test_fixture.py for why that's
the right fixture for this test and not a shortcut around real source
work, which is still entirely unstarted (docs/SOURCES.md is still empty
on purpose).

Usage:
    cd services/pipelines && python3 scripts/m2_check.py
Exit code 0 on PASS, 1 on FAIL -- scriptable from Coolify's one-off command
execution the same way a CI check would be.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Allow running as a plain script (`python3 scripts/m2_check.py`) from
# services/pipelines/ without needing an editable install.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flows.ingest import ingest  # noqa: E402
from lib.anomaly import AnomalyDetected  # noqa: E402
from lib.snapshot import ensure_bucket  # noqa: E402


class Step:
    def __init__(self, name: str):
        self.name = name
        self.ok = False
        self.detail = ""
        self.ms = 0.0

    def __enter__(self):
        self._start = time.monotonic()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.ms = (time.monotonic() - self._start) * 1000
        return False  # never swallow -- caller decides


def run() -> bool:
    steps: list[Step] = []

    step = Step("Ensure raw-snapshot bucket exists (S3-compatible, BUILD.md §8.1)")
    with step:
        try:
            ensure_bucket()
            step.ok = True
            step.detail = "bucket ready"
        except Exception as err:  # noqa: BLE001
            step.detail = str(err)
    steps.append(step)
    if not step.ok:
        return report(steps)

    step = Step("Fresh ingest of the test-fixture connector (BUILD.md §8.1)")
    original = None
    with step:
        try:
            original = ingest("test-fixture")
            step.ok = True
            step.detail = (
                f"snapshot_key={original.snapshot_key} "
                f"source.id={original.source_id} "
                f"places={len(original.place_ids)} signals={len(original.signal_ids)}"
            )
        except Exception as err:  # noqa: BLE001
            step.detail = str(err)
    steps.append(step)
    if not step.ok or original is None:
        return report(steps)

    step = Step("Replay the SAME run from its raw S3 snapshot (BUILD.md M2 done-when: replayable from raw)")
    with step:
        try:
            replay = ingest("test-fixture", replay_from=original.snapshot_key)
            if not replay.replayed:
                raise AssertionError("ingest() did not report replayed=True")
            if replay.content_hash != original.content_hash:
                raise AssertionError(
                    f"replayed content hash {replay.content_hash} != original {original.content_hash} "
                    "-- raw storage or parsing is not faithfully reproducible"
                )
            step.ok = True
            step.detail = (
                f"content_hash matches ({replay.content_hash[:12]}...), "
                f"new signal rows appended: {len(replay.signal_ids)} "
                "(expected -- signal is append-only, a replay is a new observation, not a dedupe)"
            )
        except Exception as err:  # noqa: BLE001
            step.detail = str(err)
    steps.append(step)
    if not step.ok:
        return report(steps)

    step = Step("Ingest a deliberately poisoned batch -- must be blocked, not staged (BUILD.md M2 done-when)")
    with step:
        try:
            ingest("test-fixture", poisoned=True)
            step.detail = "ingest() succeeded on a poisoned batch -- the anomaly gate did not fire. This is a real bug."
        except AnomalyDetected as err:
            if err.rule == "impossible_temp":
                step.ok = True
                step.detail = f"correctly halted: {err}"
            else:
                step.detail = f"halted, but by an unexpected rule ({err.rule}): {err}"
        except Exception as err:  # noqa: BLE001
            step.detail = f"halted, but not by AnomalyDetected as expected: {err}"
    steps.append(step)

    return report(steps)


def report(steps: list[Step]) -> bool:
    all_passed = len(steps) == 4 and all(s.ok for s in steps)
    print()
    print("=" * 72)
    print("M2 ACCEPTANCE TEST -- BUILD.md §15")
    print("=" * 72)
    for s in steps:
        mark = "PASS" if s.ok else "FAIL"
        print(f"[{mark}] {s.name} ({s.ms:.0f}ms)")
        print(f"       {s.detail}")
    print("-" * 72)
    print("PASS -- M2 done-when condition satisfied" if all_passed else "FAIL -- see above")
    print("=" * 72)
    return all_passed


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
