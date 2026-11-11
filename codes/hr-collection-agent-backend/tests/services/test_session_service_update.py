"""SessionService.update_fields: all-or-nothing, concurrent-safe, reviewing only (task 2.3)."""

import json
import threading

import pytest

from app.core.errors import SessionNotFoundError, SessionReadOnlyError, ValidationFailedError
from app.schemas.resume_fields import ResumeFieldsUpdate
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv, make_upload


def upd(**fields: object) -> ResumeFieldsUpdate:
    return ResumeFieldsUpdate.model_validate(fields)


@pytest.fixture
def sid(session_env: SessionEnv) -> str:
    return session_env.service.create(make_upload(), BROWSER_A).detail.session_id


def stored(env: SessionEnv) -> dict:
    return json.loads(env.query("SELECT fields_json FROM sessions")[0][0])


def test_update_writes_merged_fields_and_refreshes_times(session_env: SessionEnv, sid: str) -> None:
    session_env.clock.advance(hours=1)
    result = session_env.service.update_fields(sid, BROWSER_A, upd(job_title="Staff"))
    assert result.fields.job_title.value == "Staff"
    assert stored(session_env)["job_title"] == {"value": "Staff", "status": "confirmed"}
    assert session_env.query("SELECT updated_at, last_active_at FROM sessions") == [
        (result.updated_at, result.updated_at)
    ]


def test_validation_failure_writes_nothing_and_details_do_not_echo_values(
    session_env: SessionEnv, sid: str
) -> None:
    before = session_env.query("SELECT fields_json FROM sessions")
    with pytest.raises(ValidationFailedError) as caught:
        session_env.service.update_fields(sid, BROWSER_A, upd(phone="12 ZZ", job_title="NEW"))
    assert [(i.field, i.reason.value) for i in caught.value.details] == [
        ("phone", "invalid_format")
    ]
    assert "ZZ" not in str(caught.value.details)
    assert session_env.query("SELECT fields_json FROM sessions") == before


def test_foreign_unknown_and_saved_sessions_are_rejected(session_env: SessionEnv, sid: str) -> None:
    for who, target in ((BROWSER_B, sid), (BROWSER_A, "nope"), (None, sid)):
        with pytest.raises(SessionNotFoundError):
            session_env.service.update_fields(target, who, upd(job_title="X"))
    session_env.query("SELECT 1")
    import sqlite3

    conn = sqlite3.connect(session_env.data_dir / "drafts.db")
    conn.execute("UPDATE sessions SET status='saved', resume_id='r', file_path=NULL")
    conn.commit()
    conn.close()
    with pytest.raises(SessionReadOnlyError):
        session_env.service.update_fields(sid, BROWSER_A, upd(job_title="X"))


def test_concurrent_updates_of_different_fields_are_both_kept(
    session_env: SessionEnv, sid: str
) -> None:
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def run(**fields: object) -> None:
        try:
            barrier.wait(timeout=5)
            session_env.service.update_fields(sid, BROWSER_A, upd(**fields))
        except BaseException as exc:  # noqa: BLE001 - surfaced below
            errors.append(exc)

    threads = [
        threading.Thread(target=run, kwargs={"job_title": "T1"}),
        threading.Thread(target=run, kwargs={"homepage": "H1"}),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(10)
    assert errors == []
    data = stored(session_env)
    assert data["job_title"]["value"] == "T1" and data["homepage"]["value"] == "H1"
