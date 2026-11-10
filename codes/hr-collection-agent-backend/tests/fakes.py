"""Test doubles shared across test modules."""

import threading
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
        self._lock = threading.Lock()

    def new_id(self) -> str:
        with self._lock:
            self._n += 1
            return f"00000000-0000-4000-8000-{self._n:012d}"


class FakeParserClient:
    """ResumeParserClient double: returns a preset result or raises a preset error."""

    def __init__(self, result: object = None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.calls: list[tuple[bytes, str]] = []

    def parse(self, content: bytes, content_type: str) -> object:
        self.calls.append((content, content_type))
        if self.error is not None:
            raise self.error
        return self.result


def make_raw_result(**overrides: object):  # noqa: ANN201
    """A model-like result for a fictional person. Override or add field nodes by key."""
    from app.schemas.parse import RawParseResult

    def node(value: object, status: str = "recognized") -> dict:
        return {"value": value, "status": status}

    data: dict = {
        "name": node("ZHANG SAN"),
        "job_title": node("BACKEND ENGINEER"),
        "phone": node("13800138000"),
        "email": node("ZS@EXAMPLE.COM"),
        "current_city": node("SHANGHAI", "uncertain"),
        "skills": node(["PYTHON", "SQL"]),
        "educations": node([{"school": "EXAMPLE UNIVERSITY", "start_date": "2015"}]),
        "work_experiences": node([{"company": "EXAMPLE CORP", "responsibilities": ["BUILD"]}]),
    }
    data.update(overrides)
    return RawParseResult(data=data, prompt_tokens=10, completion_tokens=5)
