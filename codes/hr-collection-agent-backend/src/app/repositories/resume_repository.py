"""Confirmed resumes (resumes.db). SQL only: no business decisions, all values bound."""

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from app.core.db import connect, transaction
from app.core.errors import DuplicateIdentityError
from app.schemas.archive import ResumeValues
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
    created_at: str  # first save time; on create it is also the initial updated_at
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


@dataclass(frozen=True)
class ResumeSummaryRow:
    """One archive list row."""

    id: str
    name: str
    phone: str
    email: str
    job_title: str | None
    created_at: str  # first save time


@dataclass(frozen=True)
class ResumeDetail:
    """A full stored resume: values plus original-file metadata and timestamps."""

    id: str
    values: ResumeValues
    file_path: str  # relative to FILE_DIR; read it only through ArchiveFileStore
    original_filename: str
    content_type: str
    file_size: int
    created_at: str
    updated_at: str


class ResumeConflictError(Exception):
    """Internal: ``replace_aggregate`` found no record with the given id and identity keys."""


class ResumeReader(Protocol):
    """Read-only view of the resumes store (no write method is reachable through it)."""

    def find_by_identity_key(
        self, name_key: str, phone_key: str, email_key: str
    ) -> ResumeRef | None: ...

    def list_summaries(self) -> list[ResumeSummaryRow]: ...

    def get_detail(self, resume_id: str) -> ResumeDetail | None: ...

    def get_names(self, resume_ids: list[str]) -> dict[str, str]: ...


_SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")
_SCALARS = (
    "name", "job_title", "expected_city", "expected_salary", "available_time", "phone", "email",
    "homepage", "gender", "birth_month", "political_status", "current_city", "work_years",
    "highest_education", "self_evaluation",
)  # fmt: skip
_LISTS = ("strengths", "skills", "certificates_honors", "languages")
_LIST_COLUMNS = ("responsibilities_json", "achievements_json")
_BLOCKS = (
    (
        "work_experiences", "resume_work_experiences",
        ("company", "position", "start_date", "end_date", "department", "reports_to",
         "team_size", "responsibilities_json", "achievements_json"),
    ),
    (
        "project_experiences", "resume_project_experiences",
        ("name", "start_date", "end_date", "background", "role", "tech", "outcome"),
    ),
    ("educations", "resume_educations",
     ("start_date", "end_date", "school", "major", "degree", "honors")),
)  # fmt: skip


def _decode_lists(row: sqlite3.Row, cols: tuple[str, ...]) -> dict[str, list[str]]:
    """Decode the JSON list columns of a work-experience row (``xxx_json`` -> ``xxx``)."""
    return {c.removesuffix("_json"): json.loads(row[c]) for c in cols if c in _LIST_COLUMNS}


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
                self._insert_sub_rows(conn, resume, resume.created_at, resume.created_at)
        except sqlite3.IntegrityError as exc:
            if _IDENTITY_COLUMN in str(exc):
                raise DuplicateIdentityError() from exc
            raise

    def replace_aggregate(self, resume: NewResume, updated_at: str) -> str:
        """Overwrite an existing record in place (confirmed update); return the old file path.

        One BEGIN IMMEDIATE transaction: guarded UPDATE of the main row (id plus the three
        identity keys must still match, ``created_at`` is kept), sub-rows deleted and re-created
        with ``updated_at`` as their timestamps. Any failure rolls everything back.
        """
        try:
            with closing(connect(self._db_path)) as conn, transaction(conn):
                old = conn.execute(
                    "SELECT file_path FROM resumes WHERE id = ?", (resume.id,)
                ).fetchone()
                if old is None:
                    raise ResumeConflictError()
                self._update_main(conn, resume, updated_at)
                for table in _SUB_TABLES:
                    conn.execute(f"DELETE FROM {table} WHERE resume_id = ?", (resume.id,))  # noqa: S608
                self._insert_sub_rows(conn, resume, updated_at, updated_at)
                return old["file_path"]
        except sqlite3.IntegrityError as exc:
            if _IDENTITY_COLUMN in str(exc):
                raise DuplicateIdentityError() from exc
            raise

    def list_summaries(self) -> list[ResumeSummaryRow]:
        """All records, most recently saved first."""
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                "SELECT id, name, phone, email, job_title, created_at FROM resumes "
                "ORDER BY created_at DESC, id"
            ).fetchall()
        return [ResumeSummaryRow(**dict(r)) for r in rows]

    def get_names(self, resume_ids: list[str]) -> dict[str, str]:
        """Names for the given ids; ids without a record are absent from the result."""
        if not resume_ids:
            return {}
        marks = ", ".join("?" for _ in resume_ids)
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                f"SELECT id, name FROM resumes WHERE id IN ({marks})",  # noqa: S608
                resume_ids,
            ).fetchall()
        return {r["id"]: r["name"] for r in rows}

    def get_detail(self, resume_id: str) -> ResumeDetail | None:
        with closing(connect(self._db_path)) as conn:
            main = conn.execute("SELECT * FROM resumes WHERE id = ?", (resume_id,)).fetchone()
            if main is None:
                return None
            blocks = {
                key: [
                    {c: r[c] for c in cols if c not in _LIST_COLUMNS} | _decode_lists(r, cols)
                    for r in conn.execute(
                        f"SELECT * FROM {table} WHERE resume_id = ? ORDER BY seq",  # noqa: S608
                        (resume_id,),
                    ).fetchall()
                ]
                for key, table, cols in _BLOCKS
            }
        values = {k: main[k] for k in _SCALARS}
        values |= {k: json.loads(main[f"{k}_json"]) for k in _LISTS}
        return ResumeDetail(
            id=main["id"],
            values=ResumeValues.model_validate(values | blocks),
            file_path=main["file_path"],
            original_filename=main["original_filename"],
            content_type=main["content_type"],
            file_size=main["file_size"],
            created_at=main["created_at"],
            updated_at=main["updated_at"],
        )

    @staticmethod
    def _update_main(conn: sqlite3.Connection, r: NewResume, updated_at: str) -> None:
        cursor = conn.execute(
            "UPDATE resumes SET name = ?, phone = ?, email = ?, job_title = ?, "
            "expected_city = ?, expected_salary = ?, available_time = ?, homepage = ?, "
            "gender = ?, birth_month = ?, political_status = ?, current_city = ?, "
            "work_years = ?, highest_education = ?, strengths_json = ?, skills_json = ?, "
            "certificates_honors_json = ?, languages_json = ?, self_evaluation = ?, "
            "file_path = ?, original_filename = ?, content_type = ?, file_size = ?, "
            "updated_at = ? WHERE id = ? AND name_key = ? AND phone_key = ? AND email_key = ?",
            (
                r.name, r.phone, r.email, r.job_title, r.expected_city, r.expected_salary,
                r.available_time, r.homepage, r.gender, r.birth_month, r.political_status,
                r.current_city, r.work_years, r.highest_education, _json(r.strengths),
                _json(r.skills), _json(r.certificates_honors), _json(r.languages),
                r.self_evaluation, r.file_path, r.original_filename, r.content_type,
                r.file_size, updated_at, r.id, r.name_key, r.phone_key, r.email_key,
            ),
        )  # fmt: skip
        if cursor.rowcount != 1:  # the identity keys changed under us: abort and roll back
            raise ResumeConflictError()

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
    def _insert_sub_rows(
        conn: sqlite3.Connection, r: NewResume, created_at: str, updated_at: str
    ) -> None:
        for seq, w in enumerate(r.work_experiences):
            conn.execute(
                "INSERT INTO resume_work_experiences (resume_id, seq, company, position, "
                "start_date, end_date, department, reports_to, team_size, responsibilities_json, "
                "achievements_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "
                "?, ?, ?, ?)",
                (
                    r.id, seq, w.company, w.position, w.start_date, w.end_date, w.department,
                    w.reports_to, w.team_size, _json(w.responsibilities), _json(w.achievements),
                    created_at, updated_at,
                ),
            )  # fmt: skip
        for seq, p in enumerate(r.project_experiences):
            conn.execute(
                "INSERT INTO resume_project_experiences (resume_id, seq, name, start_date, "
                "end_date, background, role, tech, outcome, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    r.id, seq, p.name, p.start_date, p.end_date, p.background, p.role, p.tech,
                    p.outcome, created_at, updated_at,
                ),
            )  # fmt: skip
        for seq, e in enumerate(r.educations):
            conn.execute(
                "INSERT INTO resume_educations (resume_id, seq, start_date, end_date, school, "
                "major, degree, honors, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    r.id, seq, e.start_date, e.end_date, e.school, e.major, e.degree, e.honors,
                    created_at, updated_at,
                ),
            )  # fmt: skip
