"""Test doubles shared across test modules."""

from datetime import UTC, datetime, timedelta


class FakeClock:
    """Controllable UTC clock for deterministic time-window tests."""

    def __init__(self, start: datetime | None = None) -> None:
        self._now = start or datetime(2026, 11, 10, 8, 0, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, **kwargs: float) -> None:
        self._now += timedelta(**kwargs)


class SequentialIdGenerator:
    """IdGenerator double that returns predictable ids."""

    def __init__(self) -> None:
        self._n = 0

    def new_id(self) -> str:
        self._n += 1
        return f"00000000-0000-4000-8000-{self._n:012d}"
