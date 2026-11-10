import pytest
from pydantic import ValidationError

from app.schemas import limits as L
from app.schemas.resume_fields import (
    Education,
    FieldStatus,
    ProjectExperience,
    ResumeFields,
    ResumeFieldsUpdate,
    WorkExperience,
)

FIELD_KEYS = [
    "name", "job_title", "expected_city", "expected_salary", "available_time", "phone", "email",
    "homepage", "gender", "birth_month", "political_status", "current_city", "work_years",
    "highest_education", "strengths", "work_experiences", "project_experiences", "educations",
    "skills", "certificates_honors", "languages", "self_evaluation",
]  # fmt: skip
LIST_KEYS = {"strengths", "skills", "certificates_honors", "languages"}
BLOCK_KEYS = {"work_experiences", "project_experiences", "educations"}


def _node(key: str) -> dict:
    empty = [] if key in LIST_KEYS | BLOCK_KEYS else None
    return {"value": empty, "status": "missing"}


def _all_fields() -> dict:
    return {k: _node(k) for k in FIELD_KEYS}


def test_resume_fields_has_22_keys() -> None:
    assert list(ResumeFields.model_fields) == FIELD_KEYS


def test_resume_fields_round_trip_snake_case() -> None:
    rf = ResumeFields.model_validate(_all_fields())
    dumped = rf.model_dump(mode="json")
    assert dumped["name"] == {"value": None, "status": "missing"}
    assert dumped["skills"] == {"value": [], "status": "missing"}


def test_resume_fields_requires_all_keys() -> None:
    data = _all_fields()
    del data["email"]
    with pytest.raises(ValidationError):
        ResumeFields.model_validate(data)


def test_resume_fields_rejects_unknown_key() -> None:
    data = _all_fields() | {"extra": _node("name")}
    with pytest.raises(ValidationError):
        ResumeFields.model_validate(data)


def test_field_status_values() -> None:
    assert {s.value for s in FieldStatus} == {"recognized", "uncertain", "missing", "confirmed"}


def test_status_rejects_unknown() -> None:
    data = _all_fields()
    data["name"]["status"] = "done"
    with pytest.raises(ValidationError):
        ResumeFields.model_validate(data)


# ---- ResumeFieldsUpdate -------------------------------------------------


def test_update_all_optional_and_tracks_presence() -> None:
    u = ResumeFieldsUpdate.model_validate({"skills": ["Python"], "job_title": None})
    assert u.model_fields_set == {"skills", "job_title"}
    assert u.job_title is None


def test_update_rejects_unknown_field() -> None:
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({"nick": "x"})
    assert ei.value.errors()[0]["type"] == "extra_forbidden"


@pytest.mark.parametrize("key", ["name", "phone", "email"])
def test_core_fields_not_nullable_or_empty(key: str) -> None:
    for bad in (None, ""):
        with pytest.raises(ValidationError):
            ResumeFieldsUpdate.model_validate({key: bad})


def test_wrong_type_rejected() -> None:
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({"skills": "Python"})
    assert ei.value.errors()[0]["type"] == "list_type"


@pytest.mark.parametrize(
    ("key", "limit"),
    [
        ("name", L.NAME_MAX),
        ("phone", L.PHONE_MAX),
        ("email", L.EMAIL_MAX),
        ("job_title", L.SCALAR_MAX),
        ("homepage", L.SCALAR_MAX),
        ("self_evaluation", L.SELF_EVALUATION_MAX),
    ],
)
def test_scalar_length_boundaries(key: str, limit: int) -> None:
    ResumeFieldsUpdate.model_validate({key: "a" * limit})
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({key: "a" * (limit + 1)})
    assert ei.value.errors()[0]["type"] == "string_too_long"


@pytest.mark.parametrize("key", sorted(LIST_KEYS))
def test_text_list_limits(key: str) -> None:
    ResumeFieldsUpdate.model_validate({key: ["a" * 1000] * 50})
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({key: ["a"] * 51})
    assert ei.value.errors()[0]["type"] == "too_long"
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({key: ["a" * 1001]})
    assert ei.value.errors()[0]["type"] == "string_too_long"


@pytest.mark.parametrize("key", sorted(BLOCK_KEYS))
def test_block_count_limit(key: str) -> None:
    ResumeFieldsUpdate.model_validate({key: [{}] * 20})
    with pytest.raises(ValidationError) as ei:
        ResumeFieldsUpdate.model_validate({key: [{}] * 21})
    assert ei.value.errors()[0]["type"] == "too_long"


def test_empty_list_means_confirmed_empty() -> None:
    u = ResumeFieldsUpdate.model_validate({"skills": [], "work_experiences": []})
    assert u.skills == [] and u.work_experiences == []


# ---- Experience entries -------------------------------------------------


@pytest.mark.parametrize(
    ("cls", "key"),
    [(WorkExperience, "company"), (ProjectExperience, "outcome"), (Education, "school")],
)
def test_entry_string_boundary(cls: type, key: str) -> None:
    cls.model_validate({key: "a" * 2000})
    with pytest.raises(ValidationError):
        cls.model_validate({key: "a" * 2001})
    assert cls.model_validate({key: None})  # nullable


def test_work_experience_lists() -> None:
    w = WorkExperience.model_validate({})
    assert w.responsibilities == [] and w.achievements == []
    WorkExperience.model_validate({"responsibilities": ["a" * 2000] * 30})
    with pytest.raises(ValidationError):
        WorkExperience.model_validate({"responsibilities": ["a"] * 31})
    with pytest.raises(ValidationError):
        WorkExperience.model_validate({"achievements": ["a" * 2001]})


@pytest.mark.parametrize("cls", [WorkExperience, ProjectExperience, Education])
def test_entries_forbid_unknown_keys(cls: type) -> None:
    with pytest.raises(ValidationError):
        cls.model_validate({"nope": 1})


def test_entry_field_names() -> None:
    assert list(WorkExperience.model_fields) == [
        "company", "position", "start_date", "end_date", "department", "reports_to",
        "team_size", "responsibilities", "achievements",
    ]  # fmt: skip
    assert list(ProjectExperience.model_fields) == [
        "name", "start_date", "end_date", "background", "role", "tech", "outcome",
    ]  # fmt: skip
    assert list(Education.model_fields) == [
        "start_date", "end_date", "school", "major", "degree", "honors",
    ]  # fmt: skip
