import re
import uuid
from datetime import UTC, datetime, timedelta, timezone

from app.core.clock import SystemClock, format_utc, parse_utc
from app.core.ids import (
    UuidGenerator,
    generate_token,
    hash_token,
)
from tests.fakes import FakeClock, SequentialIdGenerator


def test_system_clock_is_aware_utc() -> None:
    now = SystemClock().now()
    assert now.tzinfo is not None and now.utcoffset() == timedelta(0)


def test_format_utc_is_iso8601_z_seconds() -> None:
    dt = datetime(2026, 11, 10, 8, 30, 0, 123456, tzinfo=UTC)
    assert format_utc(dt) == "2026-11-10T08:30:00Z"


def test_format_utc_converts_other_zones() -> None:
    dt = datetime(2026, 11, 10, 16, 30, 0, tzinfo=timezone(timedelta(hours=8)))
    assert format_utc(dt) == "2026-11-10T08:30:00Z"


def test_parse_utc_round_trip() -> None:
    assert parse_utc("2026-11-10T08:30:00Z") == datetime(2026, 11, 10, 8, 30, tzinfo=UTC)
    assert format_utc(parse_utc("2026-11-10T08:30:00Z")) == "2026-11-10T08:30:00Z"


def test_fake_clock_advance() -> None:
    clock = FakeClock()
    start = clock.now()
    clock.advance(days=7)
    assert clock.now() - start == timedelta(days=7)


def test_uuid_generator_returns_uuid4() -> None:
    value = UuidGenerator().new_id()
    assert uuid.UUID(value).version == 4
    assert UuidGenerator().new_id() != value


def test_sequential_generator_is_deterministic() -> None:
    gen = SequentialIdGenerator()
    assert gen.new_id() != gen.new_id()


def test_token_unique_and_urlsafe() -> None:
    tokens = {generate_token() for _ in range(200)}
    assert len(tokens) == 200
    for t in tokens:
        assert len(t) >= 43
        assert re.fullmatch(r"[A-Za-z0-9_-]+", t)


def test_hash_token_stable_and_sha256_hex() -> None:
    h = hash_token("abc")
    assert h == hash_token("abc")
    assert h != hash_token("abd")
    assert re.fullmatch(r"[0-9a-f]{64}", h)
    # known SHA-256 of "abc"
    assert h == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
