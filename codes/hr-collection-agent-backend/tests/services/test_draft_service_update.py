import json
import threading

import pytest

from app.core.errors import DraftNotFoundError, ValidationFailedError
from app.schemas.resume_fields import Education, FieldStatus, ResumeFieldsUpdate, WorkExperience
from tests.services.conftest import DraftEnv, make_upload


def upd(**fields: object) -> ResumeFieldsUpdate:
    return ResumeFieldsUpdate.model_validate(fields)


@pytest.fixture
def created(draft_env: DraftEnv):  # noqa: ANN201
    return draft_env.service.create(make_upload(), None)


def stored(draft_env: DraftEnv) -> dict:
    return json.loads(draft_env.draft_rows()[0]["fields_json"])


def test_present_fields_become_confirmed_absent_fields_are_unchanged(
    draft_env: DraftEnv, created
) -> None:  # noqa: ANN001
    before = stored(draft_env)
    draft_env.clock.advance(hours=1)
    draft_env.service.update(created.token, upd(job_title="Staff Engineer", skills=["Go"]))
    after = stored(draft_env)
    assert after["job_title"] == {"value": "Staff Engineer", "status": "confirmed"}
    assert after["skills"] == {"value": ["Go"], "status": "confirmed"}
    for key in before:
        if key not in ("job_title", "skills"):
            assert after[key] == before[key]  # value and status untouched


def test_confirming_without_changing_the_value(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    result = draft_env.service.update(created.token, upd(name="ZHANG SAN"))
    assert (
        result.fields.name.value == "ZHANG SAN"
        and result.fields.name.status is FieldStatus.CONFIRMED
    )


def test_null_and_empty_list_mean_confirmed_empty(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    result = draft_env.service.update(
        created.token, upd(job_title=None, skills=[], educations=[], work_experiences=[])
    )
    f = result.fields
    assert (f.job_title.value, f.job_title.status) == (None, FieldStatus.CONFIRMED)
    for node in (f.skills, f.educations, f.work_experiences):
        assert (node.value, node.status) == ([], FieldStatus.CONFIRMED)


def test_blocks_are_replaced_as_a_whole(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    first = draft_env.service.update(
        created.token,
        upd(
            educations=[Education(school="A"), Education(school="B")],
            work_experiences=[WorkExperience(company="X")],
        ),
    )
    assert [e.school for e in first.fields.educations.value] == ["A", "B"]
    second = draft_env.service.update(created.token, upd(educations=[Education(school="B2")]))
    assert [e.school for e in second.fields.educations.value] == ["B2"]  # one removed, one edited
    assert [w.company for w in second.fields.work_experiences.value] == ["X"]  # untouched block
    assert second.fields.educations.status is FieldStatus.CONFIRMED  # one status for the block


def test_values_are_stored_as_final_with_edges_trimmed(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    draft_env.service.update(
        created.token,
        upd(name="  ZHANG SAN ", phone=" 138 0013 8000 ", gender="  ", homepage=" x "),
    )
    after = stored(draft_env)
    assert after["name"]["value"] == "ZHANG SAN"
    assert after["phone"]["value"] == "138 0013 8000"  # inner spaces kept; the key is derived later
    assert after["gender"] == {"value": None, "status": "confirmed"}  # blank text = confirmed empty
    assert after["homepage"]["value"] == "x"


def test_timestamps(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    draft_env.clock.advance(hours=2)
    result = draft_env.service.update(created.token, upd(skills=["Go"]))
    row = draft_env.draft_rows()[0]
    assert row["created_at"] == "2026-11-10T08:00:00Z"
    assert row["updated_at"] == row["last_active_at"] == "2026-11-10T10:00:00Z"
    assert (
        result.updated_at == "2026-11-10T10:00:00Z" and result.expires_at == "2026-11-17T10:00:00Z"
    )
    assert result.created_at == "2026-11-10T08:00:00Z"


def test_same_update_twice_gives_the_same_fields(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    a = draft_env.service.update(created.token, upd(skills=["Go"], job_title="X"))
    b = draft_env.service.update(created.token, upd(skills=["Go"], job_title="X"))
    assert a.fields == b.fields


# ---- validation: all-or-nothing ----


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"phone": "abc"}, {("phone", "invalid_format")}),
        ({"email": "nope"}, {("email", "invalid_format")}),
        ({"name": "   "}, {("name", "required")}),
        (
            {"phone": "12", "email": "x", "name": " "},
            {("phone", "invalid_format"), ("email", "invalid_format"), ("name", "required")},
        ),
    ],
)
def test_invalid_update_raises_and_writes_nothing(
    draft_env: DraftEnv, created, payload: dict, expected: set
) -> None:  # noqa: ANN001
    before = draft_env.draft_rows()[0]["fields_json"], draft_env.draft_rows()[0]["updated_at"]
    draft_env.clock.advance(hours=1)
    with pytest.raises(ValidationFailedError) as ei:
        draft_env.service.update(created.token, upd(skills=["Go"], **payload))  # a valid key too
    assert {(i.field, i.reason.value) for i in ei.value.details} == expected
    row = draft_env.draft_rows()[0]
    assert (row["fields_json"], row["updated_at"]) == before  # even the valid part was not written


def test_empty_update_is_rejected(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    with pytest.raises(ValidationFailedError) as ei:
        draft_env.service.update(created.token, upd())
    assert [(i.field, i.reason.value) for i in ei.value.details] == [("fields", "required")]


def test_unicode_digit_phone_is_rejected(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    with pytest.raises(ValidationFailedError):
        draft_env.service.update(
            created.token, upd(phone="1" + "".join(chr(0x0661 + i % 9) for i in range(10)))
        )


# ---- token problems ----


@pytest.mark.parametrize("token", [None, "", "unknown"])
def test_bad_token_is_not_found(draft_env: DraftEnv, created, token: str | None) -> None:  # noqa: ANN001
    with pytest.raises(DraftNotFoundError):
        draft_env.service.update(token, upd(skills=["Go"]))
    assert stored(draft_env)["skills"]["status"] == "recognized"


def test_expired_draft_is_not_found_and_unchanged(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    draft_env.clock.advance(days=7, seconds=1)
    with pytest.raises(DraftNotFoundError):
        draft_env.service.update(created.token, upd(skills=["Go"]))
    assert stored(draft_env)["skills"]["status"] == "recognized"


def test_validation_is_checked_before_the_token(draft_env: DraftEnv) -> None:
    with pytest.raises(ValidationFailedError):
        draft_env.service.update("unknown", upd(phone="abc"))


# ---- concurrency ----


def test_concurrent_updates_of_different_fields_are_both_kept(draft_env: DraftEnv, created) -> None:  # noqa: ANN001
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def work(key: str, values: list[list[str]]) -> None:
        try:
            barrier.wait(5)
            for value in values:
                draft_env.service.update(created.token, upd(**{key: value}))
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [
        threading.Thread(target=work, args=("skills", [[f"s{i}"] for i in range(10)])),
        threading.Thread(target=work, args=("languages", [[f"l{i}"] for i in range(10)])),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    after = stored(draft_env)
    assert after["skills"] == {"value": ["s9"], "status": "confirmed"}
    assert after["languages"] == {"value": ["l9"], "status": "confirmed"}
