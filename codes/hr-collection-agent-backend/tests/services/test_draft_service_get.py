import pytest

from app.core.errors import DraftNotFoundError
from app.core.ids import hash_token
from tests.services.conftest import DraftEnv, make_upload


def test_get_returns_the_draft_and_refreshes_last_activity(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=3)
    got = draft_env.service.get(created.token)
    assert got.draft_id == created.response.draft_id
    assert got.fields == created.response.fields
    assert got.created_at == got.updated_at == "2026-11-10T08:00:00Z"  # unchanged by a read
    assert got.expires_at == "2026-11-20T08:00:00Z"  # now (day 3) + 7 days
    row = draft_env.draft_rows()[0]
    assert (
        row["last_active_at"] == "2026-11-13T08:00:00Z"
        and row["updated_at"] == "2026-11-10T08:00:00Z"
    )


@pytest.mark.parametrize("token", [None, "", "unknown-token", "x" * 300])
def test_missing_or_unknown_token_is_not_found(draft_env: DraftEnv, token: str | None) -> None:
    draft_env.service.create(make_upload(), None)
    with pytest.raises(DraftNotFoundError):
        draft_env.service.get(token)


def test_expired_draft_is_not_found_and_not_touched(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=7, seconds=1)
    with pytest.raises(DraftNotFoundError):
        draft_env.service.get(created.token)
    assert draft_env.draft_rows()[0]["last_active_at"] == "2026-11-10T08:00:00Z"


def test_exactly_seven_days_old_is_still_valid(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=7)
    assert draft_env.service.get(created.token).draft_id == created.response.draft_id


def test_sliding_window_keeps_an_active_draft_alive(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    for _ in range(4):
        draft_env.clock.advance(days=6)  # 24 days in total, never idle for 7 days
        draft_env.service.get(created.token)


def test_deleted_draft_is_not_found(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    draft_env.repo.delete_by_token_hash(hash_token(created.token))
    with pytest.raises(DraftNotFoundError):
        draft_env.service.get(created.token)


def test_not_found_error_carries_no_content() -> None:
    err = DraftNotFoundError()
    assert err.details is None and "ZHANG" not in err.message
