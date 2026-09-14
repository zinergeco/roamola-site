"""BUILD.md §8.3. Flow 3 of 9.

Any anomaly above tolerance halts publishing for the affected template. It
does not warn and continue -- halting is cheap, publishing wrong data is not.
"""

ANOMALY_RULES = [
    ("price_jump", lambda s: abs(s.pct_change) > 0.60),
    ("impossible_temp", lambda s: not -50 < s.value < 60),
    ("null_surge", lambda b: b.null_rate > 0.20),
    ("stale_source", lambda src: src.days_since_success > src.refresh_days * 2),
]
