import json
import logging

import pytest

from app.core.errors import (
    ParseFailedError,
    ParseTimeoutError,
    ParseUnavailableError,
)
from app.core.ids import hash_token
from app.schemas.parse import RawParseResult
from app.schemas.resume_fields import FieldStatus
from tests.services.conftest import DraftEnv, make_upload


def test_create_stores_draft_file_and_returns_token(draft_env: DraftEnv) -> None:
    result = draft_env.service.create(make_upload("resume.pdf"), None)
    (row,) = draft_env.draft_rows()
    assert row["id"] == "00000000-0000-4000-8000-000000000001"
    assert row["token_hash"] == hash_token(result.token) and result.token not in str(dict(row))
    assert row["file_path"] == f"{row['id']}.pdf" and draft_env.draft_files() == {row["file_path"]}
    assert draft_env.files.read(row["file_path"]) == make_upload().content
    assert (row["original_filename"], row["content_type"], row["file_size"]) == (
        "resume.pdf",
        "application/pdf",
        300,
    )
    assert len(result.token) >= 43


def test_response_content(draft_env: DraftEnv) -> None:
    result = draft_env.service.create(make_upload("resume.pdf"), None)
    r = result.response
    assert r.draft_id == "00000000-0000-4000-8000-000000000001"
    assert r.original_file.model_dump() == {
        "filename": "resume.pdf", "content_type": "application/pdf", "size_bytes": 300,
    }  # fmt: skip
    assert r.fields.name.value == "ZHANG SAN" and r.fields.name.status is FieldStatus.RECOGNIZED
    assert r.fields.current_city.status is FieldStatus.UNCERTAIN
    assert r.fields.gender.status is FieldStatus.MISSING
    assert r.created_at == r.updated_at == "2026-11-10T08:00:00Z"
    assert r.expires_at == "2026-11-17T08:00:00Z"  # last activity + 7 days


def test_stored_fields_json_matches_the_response(draft_env: DraftEnv) -> None:
    result = draft_env.service.create(make_upload(), None)
    stored = json.loads(draft_env.draft_rows()[0]["fields_json"])
    assert stored == json.loads(result.response.fields.model_dump_json())
    assert set(stored) == set(result.response.fields.model_dump())


def test_all_three_timestamps_equal_now(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)
    row = draft_env.draft_rows()[0]
    assert row["created_at"] == row["updated_at"] == row["last_active_at"] == "2026-11-10T08:00:00Z"


def test_the_parser_receives_the_validated_content(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)
    assert draft_env.parser.calls == [(make_upload().content, "application/pdf")]


def test_each_upload_creates_a_new_draft_and_token(draft_env: DraftEnv) -> None:
    a = draft_env.service.create(make_upload(), None)
    b = draft_env.service.create(make_upload(), None)
    assert a.token != b.token and a.response.draft_id != b.response.draft_id
    assert len(draft_env.draft_rows()) == 2 and len(draft_env.draft_files()) == 2


# ---- O-02: failures create nothing and touch nothing ------------------------------------------


@pytest.mark.parametrize(
    "error", [ParseFailedError(), ParseUnavailableError(), ParseTimeoutError()]
)
def test_model_failure_leaves_no_row_and_no_file(draft_env: DraftEnv, error: Exception) -> None:
    draft_env.parser.error = error
    with pytest.raises(type(error)):
        draft_env.service.create(make_upload(), None)
    assert draft_env.draft_rows() == [] and draft_env.draft_files() == set()


def test_failure_keeps_the_old_draft_and_old_token(draft_env: DraftEnv) -> None:
    old = draft_env.service.create(make_upload("old.pdf"), None)
    before_rows = [dict(r) for r in draft_env.draft_rows()]
    before_files = draft_env.draft_files()
    draft_env.parser.error = ParseTimeoutError()
    with pytest.raises(ParseTimeoutError):
        draft_env.service.create(make_upload("new.pdf"), old.token)
    assert [dict(r) for r in draft_env.draft_rows()] == before_rows
    assert draft_env.draft_files() == before_files
    assert draft_env.repo.get_by_token_hash(hash_token(old.token)) is not None


def test_unusable_model_output_is_parse_failed_and_cleans_up(draft_env: DraftEnv) -> None:
    draft_env.parser.result = RawParseResult(data={"name": {"value": None, "status": "missing"}})
    with pytest.raises(ParseFailedError):
        draft_env.service.create(make_upload(), None)
    assert draft_env.draft_rows() == [] and draft_env.draft_files() == set()


def test_unexpected_parser_exception_still_cleans_up(draft_env: DraftEnv) -> None:
    draft_env.parser.error = RuntimeError("boom")
    with pytest.raises(RuntimeError, match="boom"):
        draft_env.service.create(make_upload(), None)
    assert draft_env.draft_rows() == [] and draft_env.draft_files() == set()


def test_insert_failure_removes_the_temp_file(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(record: object) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(draft_env.repo, "insert", fail)
    with pytest.raises(RuntimeError, match="db down"):
        draft_env.service.create(make_upload(), None)
    assert draft_env.draft_files() == set()


def test_cleanup_failure_is_logged_not_hiding_the_original_error(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    draft_env.parser.error = ParseTimeoutError()

    def broken_delete(name: str) -> bool:
        raise OSError("cannot delete")

    monkeypatch.setattr(draft_env.files, "delete", broken_delete)
    with pytest.raises(ParseTimeoutError):  # the original error wins
        draft_env.service.create(make_upload(), None)
    assert "cleanup_failed" in "\n".join(r.getMessage() for r in caplog.records)


# ---- O-03: a valid old token is replaced after success -----------------------------------------


def test_valid_old_token_deletes_the_old_draft_and_its_file(draft_env: DraftEnv) -> None:
    old = draft_env.service.create(make_upload("old.pdf"), None)
    old_file = draft_env.draft_rows()[0]["file_path"]
    new = draft_env.service.create(make_upload("new.pdf"), old.token)
    rows = draft_env.draft_rows()
    assert [r["id"] for r in rows] == [new.response.draft_id]
    assert old_file not in draft_env.draft_files() and len(draft_env.draft_files()) == 1
    assert draft_env.repo.get_by_token_hash(hash_token(old.token)) is None


@pytest.mark.parametrize("old_token", ["unknown-token", "", "x" * 500])
def test_invalid_old_token_is_ignored(draft_env: DraftEnv, old_token: str) -> None:
    first = draft_env.service.create(make_upload(), None)
    second = draft_env.service.create(make_upload(), old_token)
    assert {r["id"] for r in draft_env.draft_rows()} == {
        first.response.draft_id,
        second.response.draft_id,
    }


def test_old_cleanup_failure_does_not_fail_the_upload(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    old = draft_env.service.create(make_upload(), None)

    def broken_delete(name: str) -> bool:
        raise OSError("cannot delete")

    monkeypatch.setattr(draft_env.files, "delete", broken_delete)
    new = draft_env.service.create(make_upload(), old.token)
    assert new.response.draft_id in {r["id"] for r in draft_env.draft_rows()}
    assert "old_draft_cleanup_failed" in "\n".join(r.getMessage() for r in caplog.records)


def test_expiry_is_last_activity_plus_ttl(draft_env: DraftEnv) -> None:
    draft_env.clock.advance(hours=5)
    result = draft_env.service.create(make_upload(), None)
    assert result.response.expires_at == "2026-11-17T13:00:00Z"


def test_logs_contain_no_resume_content(
    draft_env: DraftEnv, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    draft_env.service.create(make_upload("ZZ-secret-name.pdf"), None)
    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "ZZ-secret-name" not in logs and "ZHANG SAN" not in logs
