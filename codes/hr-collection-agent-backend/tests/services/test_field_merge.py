"""merge_update: the single field-writing rule behind PATCH and 'apply suggestion'."""

from app.schemas.resume_fields import Education, FieldStatus, ResumeFields, ResumeFieldsUpdate
from app.services.field_merge import merge_update
from app.services.parse_normalizer import normalize
from tests.fakes import make_raw_result


def base() -> ResumeFields:
    return normalize(make_raw_result())


def upd(**fields: object) -> ResumeFieldsUpdate:
    return ResumeFieldsUpdate.model_validate(fields)


def test_present_fields_are_confirmed_and_absent_fields_unchanged() -> None:
    before = base()
    after = merge_update(before, upd(job_title="Staff", skills=["Go"]))
    assert after.job_title.value == "Staff" and after.job_title.status is FieldStatus.CONFIRMED
    assert after.skills.value == ["Go"] and after.skills.status is FieldStatus.CONFIRMED
    assert after.current_city == before.current_city and after.name == before.name


def test_null_and_empty_list_are_confirmed_empty() -> None:
    after = merge_update(base(), upd(job_title=None, skills=[], educations=[]))
    assert (after.job_title.value, after.job_title.status) == (None, FieldStatus.CONFIRMED)
    assert (after.skills.value, after.educations.value) == ([], [])
    assert after.educations.status is FieldStatus.CONFIRMED


def test_blocks_are_replaced_whole_and_blank_items_are_dropped() -> None:
    after = merge_update(
        base(),
        upd(educations=[Education(school=" A "), Education(school="  ")], skills=[" x ", " "]),
    )
    assert [e.school for e in after.educations.value] == ["A"]
    assert after.skills.value == ["x"]
