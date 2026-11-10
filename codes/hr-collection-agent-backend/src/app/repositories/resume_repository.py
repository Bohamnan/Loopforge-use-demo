"""Confirmed resumes (resumes.db). SQL only: no business decisions, all values bound."""

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path

from app.core.db import connect, transaction
from app.core.errors import DuplicateIdentityError
from app.schemas.resume_fields import Education, ProjectExperience, WorkExperience

_IDENTITY_COLUMN = "resumes.name_key"  # appears in the message of uq_resumes_identity conflicts


@dataclass(frozen=True)
class NewResume:
    """Everything needed to insert one confirmed resume with its sub-rows.

    ``*_key`` values are produced by identity_key (single implementation point); this module
    stores them as given. ``file_path`` is relative to FILE_DIR.
    """

    id: str
    name: str
    phone: str
    email: str
    name_key: str
    phone_key: str
    email_key: str
    file_path: str
    original_filename: str
    content_type: str
    file_size: int
    created_at: str  # also used as updated_at: confirmed records are never modified
    job_title: str | None = None
    expected_city: str | None = None
    expected_salary: str | None = None
    available_time: str | None = None
    homepage: str | None = None
    gender: str | None = None
    birth_month: str | None = None
    political_status: str | None = None
    current_city: str | None = None
    work_years: str | None = None
    highest_education: str | None = None
    self_evaluation: str | None = None
    strengths: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    certificates_honors: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    work_experiences: list[WorkExperience] = field(default_factory=list)
    project_experiences: list[ProjectExperience] = field(default_factory=list)
    educations: list[Education] = field(default_factory=list)


@dataclass(frozen=True)
class ResumeRef:
    """Light reference to a stored resume (no personal content)."""

    id: str
    file_path: str
    created_at: str


def _json(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False)


class ResumeRepository:
    """Access to the resumes database; every call uses its own short-lived connection."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def find_by_identity_key(
        self, name_key: str, phone_key: str, email_key: str
    ) -> ResumeRef | None:
        with closing(connect(self._db_path)) as conn:
            row = conn.execute(
                "SELECT id, file_path, created_at FROM resumes "
                "WHERE name_key = ? AND phone_key = ? AND email_key = ?",
                (name_key, phone_key, email_key),
            ).fetchone()
        return None if row is None else ResumeRef(**dict(row))

    def exists(self, resume_id: str) -> bool:
        """Whether a record with this id is committed (read-only)."""
        with closing(connect(self._db_path)) as conn:
            row = conn.execute("SELECT 1 FROM resumes WHERE id = ?", (resume_id,)).fetchone()
        return row is not None

    def list_refs(self) -> list[ResumeRef]:
        """All stored resumes (used by start-up reconciliation)."""
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute("SELECT id, file_path, created_at FROM resumes").fetchall()
        return [ResumeRef(**dict(r)) for r in rows]

    def create_aggregate(self, resume: NewResume) -> None:
        """Insert the resume and its sub-rows in one BEGIN IMMEDIATE transaction.

        A violation of the identity unique index raises DuplicateIdentityError; every other
        integrity error propagates unchanged. On any failure nothing is written.
        """
        try:
            with closing(connect(self._db_path)) as conn, transaction(conn):
                self._insert_main(conn, resume)
                self._insert_sub_rows(conn, resume)
        except sqlite3.IntegrityError as exc:
            if _IDENTITY_COLUMN in str(exc):
                raise DuplicateIdentityError() from exc
            raise

    @staticmethod
    def _insert_main(conn: sqlite3.Connection, r: NewResume) -> None:
        conn.execute(
            "INSERT INTO resumes (id, name, phone, email, name_key, phone_key, email_key, "
            "job_title, expected_city, expected_salary, available_time, homepage, gender, "
            "birth_month, political_status, current_city, work_years, highest_education, "
            "strengths_json, skills_json, certificates_honors_json, languages_json, "
            "self_evaluation, file_path, original_filename, content_type, file_size, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "
            "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                r.id, r.name, r.phone, r.email, r.name_key, r.phone_key, r.email_key,
                r.job_title, r.expected_city, r.expected_salary, r.available_time, r.homepage,
                r.gender, r.birth_month, r.political_status, r.current_city, r.work_years,
                r.highest_education, _json(r.strengths), _json(r.skills),
                _json(r.certificates_honors), _json(r.languages), r.self_evaluation,
                r.file_path, r.original_filename, r.content_type, r.file_size,
                r.created_at, r.created_at,
            ),
        )  # fmt: skip

    @staticmethod
    def _insert_sub_rows(conn: sqlite3.Connection, r: NewResume) -> None:
        for seq, w in enumerate(r.work_experiences):
            conn.execute(
                "INSERT INTO resume_work_experiences (resume_id, seq, company, position, "
                "start_date, end_date, department, reports_to, team_size, responsibilities_json, "
                "achievements_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "
                "?, ?, ?, ?)",
                (
                    r.id, seq, w.company, w.position, w.start_date, w.end_date, w.department,
                    w.reports_to, w.team_size, _json(w.responsibilities), _json(w.achievements),
                    r.created_at, r.created_at,
                ),
            )  # fmt: skip
        for seq, p in enumerate(r.project_experiences):
            conn.execute(
                "INSERT INTO resume_project_experiences (resume_id, seq, name, start_date, "
                "end_date, background, role, tech, outcome, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    r.id, seq, p.name, p.start_date, p.end_date, p.background, p.role, p.tech,
                    p.outcome, r.created_at, r.created_at,
                ),
            )  # fmt: skip
        for seq, e in enumerate(r.educations):
            conn.execute(
                "INSERT INTO resume_educations (resume_id, seq, start_date, end_date, school, "
                "major, degree, honors, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    r.id, seq, e.start_date, e.end_date, e.school, e.major, e.degree, e.honors,
                    r.created_at, r.created_at,
                ),
            )  # fmt: skip
