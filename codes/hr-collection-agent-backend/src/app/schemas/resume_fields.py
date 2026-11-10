"""Resume model: 22 fields, each with a value and a status (isomorphic to OpenAPI)."""

from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import limits as L

_ENTRY_STR = Annotated[str | None, Field(max_length=L.ENTRY_STRING_MAX)]
_ENTRY_LIST = Annotated[
    list[Annotated[str, Field(max_length=L.ENTRY_STRING_MAX)]],
    Field(max_length=L.ENTRY_LIST_MAX_ITEMS),
]
_SCALAR = Annotated[str | None, Field(max_length=L.SCALAR_MAX)]
_TEXT_LIST = Annotated[
    list[Annotated[str, Field(max_length=L.TEXT_LIST_ITEM_MAX)]],
    Field(max_length=L.TEXT_LIST_MAX_ITEMS),
]


class FieldStatus(StrEnum):
    """Field status. missing implies an empty value; recognized/uncertain imply a value."""

    RECOGNIZED = "recognized"
    UNCERTAIN = "uncertain"
    MISSING = "missing"
    CONFIRMED = "confirmed"


class WorkExperience(BaseModel):
    """One work experience entry."""

    model_config = ConfigDict(extra="forbid")

    company: _ENTRY_STR = None
    position: _ENTRY_STR = None
    start_date: _ENTRY_STR = None  # e.g. 2021.03
    end_date: _ENTRY_STR = None  # e.g. 2024.06 or 至今
    department: _ENTRY_STR = None
    reports_to: _ENTRY_STR = None
    team_size: _ENTRY_STR = None
    responsibilities: _ENTRY_LIST = Field(default_factory=list)
    achievements: _ENTRY_LIST = Field(default_factory=list)


class ProjectExperience(BaseModel):
    """One project experience entry."""

    model_config = ConfigDict(extra="forbid")

    name: _ENTRY_STR = None
    start_date: _ENTRY_STR = None
    end_date: _ENTRY_STR = None
    background: _ENTRY_STR = None
    role: _ENTRY_STR = None
    tech: _ENTRY_STR = None
    outcome: _ENTRY_STR = None


class Education(BaseModel):
    """One education entry."""

    model_config = ConfigDict(extra="forbid")

    start_date: _ENTRY_STR = None
    end_date: _ENTRY_STR = None
    school: _ENTRY_STR = None
    major: _ENTRY_STR = None
    degree: _ENTRY_STR = None
    honors: _ENTRY_STR = None


class StringField(BaseModel):
    """Scalar field node: nullable text value plus status."""

    value: str | None
    status: FieldStatus


class StringListField(BaseModel):
    """Text-list field node."""

    value: list[str]
    status: FieldStatus


class WorkExperienceListField(BaseModel):
    """Work-experience block node; one status for the whole block (O-11)."""

    value: list[WorkExperience]
    status: FieldStatus


class ProjectExperienceListField(BaseModel):
    """Project-experience block node."""

    value: list[ProjectExperience]
    status: FieldStatus


class EducationListField(BaseModel):
    """Education block node."""

    value: list[Education]
    status: FieldStatus


class ResumeFields(BaseModel):
    """The 22 resume fields. name, phone and email are required before saving."""

    model_config = ConfigDict(extra="forbid")

    name: StringField
    job_title: StringField
    expected_city: StringField
    expected_salary: StringField
    available_time: StringField
    phone: StringField
    email: StringField
    homepage: StringField
    gender: StringField
    birth_month: StringField
    political_status: StringField
    current_city: StringField
    work_years: StringField
    highest_education: StringField
    strengths: StringListField
    work_experiences: WorkExperienceListField
    project_experiences: ProjectExperienceListField
    educations: EducationListField
    skills: StringListField
    certificates_honors: StringListField
    languages: StringListField
    self_evaluation: StringField


# Partial update. A key that is present (see ``model_fields_set``) becomes ``confirmed``.
# Core fields are non-null; phone/email *patterns* are applied by field_validation after
# stripping spaces/hyphens (G-02), so they are not enforced here.
_CORE_ABSENT = None  # default only; validation of absent keys is skipped


class ResumeFieldsUpdate(BaseModel):
    """Partial update; values are final. Nullable scalars mean 'confirmed empty'."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=L.NAME_MAX)] = _CORE_ABSENT  # type: ignore[assignment]
    job_title: _SCALAR = None
    expected_city: _SCALAR = None
    expected_salary: _SCALAR = None
    available_time: _SCALAR = None
    phone: Annotated[str, Field(min_length=1, max_length=L.PHONE_MAX)] = _CORE_ABSENT  # type: ignore[assignment]
    email: Annotated[str, Field(min_length=1, max_length=L.EMAIL_MAX)] = _CORE_ABSENT  # type: ignore[assignment]
    homepage: _SCALAR = None
    gender: _SCALAR = None
    birth_month: _SCALAR = None
    political_status: _SCALAR = None
    current_city: _SCALAR = None
    work_years: _SCALAR = None
    highest_education: _SCALAR = None
    strengths: _TEXT_LIST = _CORE_ABSENT  # type: ignore[assignment]
    work_experiences: Annotated[list[WorkExperience], Field(max_length=L.BLOCK_MAX_ENTRIES)] = (
        _CORE_ABSENT  # type: ignore[assignment]
    )
    project_experiences: Annotated[
        list[ProjectExperience], Field(max_length=L.BLOCK_MAX_ENTRIES)
    ] = _CORE_ABSENT  # type: ignore[assignment]
    educations: Annotated[list[Education], Field(max_length=L.BLOCK_MAX_ENTRIES)] = _CORE_ABSENT  # type: ignore[assignment]
    skills: _TEXT_LIST = _CORE_ABSENT  # type: ignore[assignment]
    certificates_honors: _TEXT_LIST = _CORE_ABSENT  # type: ignore[assignment]
    languages: _TEXT_LIST = _CORE_ABSENT  # type: ignore[assignment]
    self_evaluation: Annotated[str | None, Field(max_length=L.SELF_EVALUATION_MAX)] = None
