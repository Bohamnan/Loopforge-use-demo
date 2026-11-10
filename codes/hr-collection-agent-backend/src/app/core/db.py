"""SQLite helpers: connection factory, two-database initialisation, write transactions.

DDL mirrors backend-docs/HR_PR-1/02_schema/sql_ddl_resume.md (schema version 1).
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_BUSY_TIMEOUT_MS = 5000

DRAFTS_DDL = """
CREATE TABLE IF NOT EXISTS drafts (
    id                TEXT    NOT NULL PRIMARY KEY,
    token_hash        TEXT    NOT NULL,
    file_path         TEXT    NOT NULL,
    original_filename TEXT    NOT NULL,
    content_type      TEXT    NOT NULL
                      CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    file_size         INTEGER NOT NULL
                      CHECK (file_size > 0 AND file_size <= 10485760),
    fields_json       TEXT    NOT NULL,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    last_active_at    TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_token_hash ON drafts (token_hash);
CREATE INDEX        IF NOT EXISTS idx_drafts_last_active ON drafts (last_active_at);
"""

RESUMES_DDL = """
CREATE TABLE IF NOT EXISTS resumes (
    id                  TEXT    NOT NULL PRIMARY KEY,
    name                TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    phone               TEXT    NOT NULL CHECK (length(trim(phone)) > 0),
    email               TEXT    NOT NULL CHECK (length(trim(email)) > 0),
    name_key            TEXT    NOT NULL,
    phone_key           TEXT    NOT NULL,
    email_key           TEXT    NOT NULL,
    job_title           TEXT,
    expected_city       TEXT,
    expected_salary     TEXT,
    available_time      TEXT,
    homepage            TEXT,
    gender              TEXT,
    birth_month         TEXT,
    political_status    TEXT,
    current_city        TEXT,
    work_years          TEXT,
    highest_education   TEXT,
    strengths_json            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(strengths_json)),
    skills_json               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skills_json)),
    certificates_honors_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(certificates_honors_json)),
    languages_json            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(languages_json)),
    self_evaluation     TEXT,
    file_path           TEXT    NOT NULL,
    original_filename   TEXT    NOT NULL,
    content_type        TEXT    NOT NULL
                        CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    file_size           INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_identity ON resumes (name_key, phone_key, email_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_file_path ON resumes (file_path);
CREATE TABLE IF NOT EXISTS resume_work_experiences (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id           TEXT    NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
    seq                 INTEGER NOT NULL CHECK (seq >= 0),
    company             TEXT,
    position            TEXT,
    start_date          TEXT,
    end_date            TEXT,
    department          TEXT,
    reports_to          TEXT,
    team_size           TEXT,
    responsibilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(responsibilities_json)),
    achievements_json     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(achievements_json)),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_resume_seq ON resume_work_experiences (resume_id, seq);
CREATE TABLE IF NOT EXISTS resume_project_experiences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id   TEXT    NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL CHECK (seq >= 0),
    name        TEXT,
    start_date  TEXT,
    end_date    TEXT,
    background  TEXT,
    role        TEXT,
    tech        TEXT,
    outcome     TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_resume_seq ON resume_project_experiences (resume_id, seq);
CREATE TABLE IF NOT EXISTS resume_educations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id   TEXT    NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL CHECK (seq >= 0),
    start_date  TEXT,
    end_date    TEXT,
    school      TEXT,
    major       TEXT,
    degree      TEXT,
    honors      TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_resume_seq ON resume_educations (resume_id, seq);
"""


def connect(path: Path, busy_timeout_ms: int = DEFAULT_BUSY_TIMEOUT_MS) -> sqlite3.Connection:
    """Open a connection in autocommit mode; transactions are explicit via :func:`transaction`."""
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {int(busy_timeout_ms)}")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Run a write transaction with BEGIN IMMEDIATE so concurrent writers queue up."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def _init(path: Path, ddl: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"database schema version {version} is newer than supported")
        conn.executescript(ddl)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    finally:
        conn.close()


def init_drafts_db(path: Path) -> None:
    """Create the drafts database if needed (idempotent)."""
    _init(path, DRAFTS_DDL)


def init_resumes_db(path: Path) -> None:
    """Create the resumes database and sub-tables if needed (idempotent)."""
    _init(path, RESUMES_DDL)
