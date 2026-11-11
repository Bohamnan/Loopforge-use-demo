"""SQLite helpers: connection factory, two-database initialisation, write transactions.

DDL mirrors backend-docs/HR_PR-1/02_schema/sql_ddl_resume.md (drafts.db version 2, resumes.db version 1).
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

DRAFTS_SCHEMA_VERSION = 2
RESUMES_SCHEMA_VERSION = 1
MIN_SQLITE_VERSION = (3, 35, 0)  # DELETE/UPDATE ... RETURNING is used by the repositories
DEFAULT_BUSY_TIMEOUT_MS = 5000

SESSIONS_DDL = """
CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT    NOT NULL PRIMARY KEY,
    browser_hash      TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'reviewing'
                      CHECK (status IN ('reviewing', 'saved')),
    file_path         TEXT,
    original_filename TEXT    NOT NULL,
    content_type      TEXT    NOT NULL
                      CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    file_size         INTEGER NOT NULL
                      CHECK (file_size > 0 AND file_size <= 10485760),
    fields_json       TEXT    NOT NULL CHECK (json_valid(fields_json)),
    resume_id         TEXT,
    update_state      TEXT    NOT NULL DEFAULT 'none'
                      CHECK (update_state IN ('none', 'pending', 'applied')),
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    last_active_at    TEXT    NOT NULL,
    CHECK (
        (status = 'reviewing' AND resume_id IS NULL AND update_state = 'none'
            AND file_path IS NOT NULL)
        OR
        (status = 'saved' AND resume_id IS NOT NULL
            AND (update_state <> 'pending' OR file_path IS NOT NULL))
    )
);
CREATE INDEX IF NOT EXISTS idx_sessions_browser_active
    ON sessions (browser_hash, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_resume ON sessions (resume_id);
CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT    NOT NULL PRIMARY KEY,
    session_id  TEXT    NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL CHECK (seq >= 1),
    role        TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT    NOT NULL CHECK (length(content) > 0),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_session_seq ON chat_messages (session_id, seq);
CREATE TABLE IF NOT EXISTS chat_suggestions (
    id            TEXT    NOT NULL PRIMARY KEY,
    session_id    TEXT    NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    message_id    TEXT    NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL CHECK (seq >= 1),
    field         TEXT    NOT NULL
                  CHECK (field IN ('name','job_title','expected_city','expected_salary',
                                   'available_time','phone','email','homepage','gender',
                                   'birth_month','political_status','current_city','work_years',
                                   'highest_education','self_evaluation','strengths','skills',
                                   'certificates_honors','languages')),
    new_value_json TEXT   NOT NULL CHECK (json_valid(new_value_json)),
    applicable    INTEGER NOT NULL CHECK (applicable IN (0, 1)),
    reason        TEXT    CHECK (reason IN ('required','invalid_format','invalid_type','too_long')),
    status        TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'applied', 'cancelled')),
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    CHECK ((applicable = 1 AND reason IS NULL) OR (applicable = 0 AND reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_suggestions_msg_seq ON chat_suggestions (message_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_suggestions_session ON chat_suggestions (session_id);
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


def _check_sqlite_version() -> None:
    if sqlite3.sqlite_version_info < MIN_SQLITE_VERSION:
        raise RuntimeError("SQLite >= 3.35 is required (RETURNING support)")


def _statements(ddl: str) -> list[str]:
    """Split a DDL script into statements (the scripts contain no literal semicolons)."""
    return [part.strip() for part in ddl.split(";") if part.strip()]


def _init(path: Path, ddl: str, version: int, *, drop_before_upgrade: tuple[str, ...] = ()) -> None:
    """Create or upgrade one database inside a single transaction (DDL is transactional)."""
    _check_sqlite_version()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        with transaction(conn):
            current = conn.execute("PRAGMA user_version").fetchone()[0]
            if current > version:
                raise RuntimeError(f"database schema version {current} is newer than supported")
            if current < version:
                for table in drop_before_upgrade:  # v1 drafts are discarded, not migrated
                    conn.execute(f"DROP TABLE IF EXISTS {table}")  # noqa: S608 - constant names
            for statement in _statements(ddl):
                conn.execute(statement)
            conn.execute(f"PRAGMA user_version = {version}")
    finally:
        conn.close()


def init_drafts_db(path: Path) -> None:
    """Create or upgrade the sessions/chat database to version 2 (idempotent)."""
    _init(path, SESSIONS_DDL, DRAFTS_SCHEMA_VERSION, drop_before_upgrade=("drafts",))


def init_resumes_db(path: Path) -> None:
    """Create the resumes database and sub-tables if needed (idempotent)."""
    _init(path, RESUMES_DDL, RESUMES_SCHEMA_VERSION)
