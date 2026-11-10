"""Injectable UTC clock and ISO 8601 helpers."""

from datetime import UTC, datetime
from typing import Protocol

_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class Clock(Protocol):
    """Source of the current time."""

    def now(self) -> datetime:
        """Return the current time as a timezone-aware UTC datetime."""
        ...


class SystemClock:
    """Clock backed by the system time."""

    def now(self) -> datetime:
        return datetime.now(UTC)


def format_utc(value: datetime) -> str:
    """Format as ISO 8601 UTC text with seconds precision (``YYYY-MM-DDTHH:MM:SSZ``)."""
    return value.astimezone(UTC).strftime(_FORMAT)


def parse_utc(text: str) -> datetime:
    """Parse text produced by :func:`format_utc`."""
    return datetime.strptime(text, _FORMAT).replace(tzinfo=UTC)
