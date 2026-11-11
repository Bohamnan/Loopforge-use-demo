"""Archive DTOs: archived resumes (values only), list rows."""

from pydantic import BaseModel, ConfigDict

from app.schemas.file_info import OriginalFileInfo
from app.schemas.resume_fields import Education, ProjectExperience, WorkExperience


class ResumeValues(BaseModel):
    """The 22 resume fields as plain values (no statuses); all keys present."""

    model_config = ConfigDict(extra="forbid")

    name: str | None
    job_title: str | None
    expected_city: str | None
    expected_salary: str | None
    available_time: str | None
    phone: str | None
    email: str | None
    homepage: str | None
    gender: str | None
    birth_month: str | None
    political_status: str | None
    current_city: str | None
    work_years: str | None
    highest_education: str | None
    strengths: list[str]
    work_experiences: list[WorkExperience]
    project_experiences: list[ProjectExperience]
    educations: list[Education]
    skills: list[str]
    certificates_honors: list[str]
    languages: list[str]
    self_evaluation: str | None


class ArchivedResume(BaseModel):
    """A saved resume with its original-file metadata."""

    resume_id: str  # UUID
    fields: ResumeValues
    original_file: OriginalFileInfo
    file_available: bool  # false when the archived file is missing; fields still readable
    saved_at: str  # first save time, ISO 8601 UTC
    updated_at: str  # last confirmed update; equals saved_at if never updated


class ResumeSummary(BaseModel):
    """One row of the archive list."""

    resume_id: str  # UUID
    name: str
    phone: str
    email: str
    job_title: str | None
    saved_at: str  # ISO 8601 UTC


class ResumeListResponse(BaseModel):
    """Archived resumes, most recently saved first."""

    items: list[ResumeSummary]
