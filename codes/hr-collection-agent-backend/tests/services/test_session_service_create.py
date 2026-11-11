"""SessionService.create / list: upload creates sessions, never deletes others (task 2.1)."""

import pytest

from app.core.errors import ParseFailedError
from app.core.ids import hash_token
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv, make_upload


def test_create_inserts_a_reviewing_session_owned_by_the_browser_hash(
    session_env: SessionEnv,
) -> None:
    created = session_env.service.create(make_upload(), BROWSER_A)
    assert created.browser_id == BROWSER_A
    detail = created.detail
    assert (detail.status, detail.update_state, detail.messages) == ("reviewing", "none", [])
    assert detail.name == "简历 · ZHANG SAN"
    rows = session_env.query("SELECT id, browser_hash, status, file_path FROM sessions")
    assert rows == [
        (detail.session_id, hash_token(BROWSER_A), "reviewing", f"{detail.session_id}.pdf")
    ]
    assert session_env.session_files() == {f"{detail.session_id}.pdf"}


def test_create_without_identifier_issues_a_new_one_and_a_second_upload_keeps_both(
    session_env: SessionEnv,
) -> None:
    first = session_env.service.create(make_upload(), None)
    assert len(first.browser_id) == 43
    session_env.service.create(make_upload(), first.browser_id)
    assert session_env.query("SELECT count(*) FROM sessions") == [(2,)]
    assert len(session_env.session_files()) == 2


def test_parse_failure_leaves_no_row_and_no_file_and_other_sessions_untouched(
    session_env: SessionEnv,
) -> None:
    session_env.service.create(make_upload(), BROWSER_A)
    session_env.parser.error = ParseFailedError()
    with pytest.raises(ParseFailedError):
        session_env.service.create(make_upload(), BROWSER_A)
    assert session_env.query("SELECT count(*) FROM sessions") == [(1,)]
    assert len(session_env.session_files()) == 1


def test_list_is_most_recent_first_scoped_to_the_browser_and_empty_without_identifier(
    session_env: SessionEnv,
) -> None:
    old = session_env.service.create(make_upload(), BROWSER_A).detail
    session_env.clock.advance(minutes=5)
    new = session_env.service.create(make_upload(), BROWSER_A).detail
    session_env.service.create(make_upload(), BROWSER_B)
    items = session_env.service.list(BROWSER_A).items
    assert [i.session_id for i in items] == [new.session_id, old.session_id]
    assert session_env.service.list(None).items == []
