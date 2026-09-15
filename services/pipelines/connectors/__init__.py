"""One module per source, per BUILD.md §8's `connectors/` layout -- mirrors
docs/SOURCES.md, whose only populated row today is `test-fixture` (the
synthetic pipeline-test connector; see test_fixture.py's own docstring for
why that's still true and what it would take to add a real one).
"""

from __future__ import annotations

from . import test_fixture

_REGISTRY = {
    test_fixture.SOURCE_SLUG: test_fixture,
}


def connector(source_slug: str):
    try:
        return _REGISTRY[source_slug]
    except KeyError as err:
        raise ValueError(
            f"no connector registered for source_slug={source_slug!r} "
            f"-- known: {sorted(_REGISTRY)}"
        ) from err
