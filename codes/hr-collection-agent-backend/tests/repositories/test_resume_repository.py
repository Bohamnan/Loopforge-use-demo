import sqlite3
import threading
from pathlib import Path

import pytest

from app.core.db import connect, init_resumes_db
from app.core.errors import DuplicateIdentityError
from app.repositories.resume_repository import (
    NewResume,
    ResumeConflictError,
    ResumeReader,
    ResumeRef,
    ResumeRepository,
)
from app.schemas.resume_fields import Education, ProjectExperience, WorkExperience

T0 = "2026-11-10T08:00:00Z"


@pytest.fixture
def db_path(data_dir: Path) -> Path:
    path = data_dir / "resumes.db"
    init_resumes_db(path)
    return path


@pytest.fixture
def repo(db_path: Path) -> ResumeRepository:
    return ResumeRepository(db_path)


def make_resume(n: int = 1, **over: object) -> NewResume:
    rid = f"00000000-0000-4000-8000-{n:012d}"
    base = {
        "id": rid,
        "name": "ZZ合成姓名",
        "phone": "13800138000",
        "email": "zz@example.com",
        "name_key": f"zz合成姓名{n}",
        "phone_key": "13800138000",
        "email_key": "zz@example.com",
        "file_path": f"{rid}.pdf",
        "original_filename": "synthetic.pdf",
        "content_type": "application/pdf",
        "file_size": 100,
        "created_at": T0,
    }
    return NewResume(**(base | over))


def rows(db_path: Path, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return connect(db_path).execute(sql, params).fetchall()


def count(db_path: Path, table: str) -> int:
    return rows(db_path, f"SELECT count(*) AS c FROM {table}")[0]["c"]  # noqa: S608


def full_resume() -> NewResume:
    return make_resume(
        job_title="后端工程师",
        expected_city="上海",
        homepage="https://example.test",
        self_evaluation="自评",
        strengths=["沟通"],
        skills=["Python", "SQL"],
        certificates_honors=[],
        languages=["英语"],
        work_experiences=[
            WorkExperience(company="甲公司", responsibilities=["开发"], achievements=["优化"]),
            WorkExperience(company="乙公司"),
        ],
        project_experiences=[ProjectExperience(name="项目一", tech="Python")],
        educations=[Education(school="示例大学"), Education(school="示例学院"), Education()],
    )


def test_create_aggregate_writes_main_and_sub_rows(repo: ResumeRepository, db_path: Path) -> None:
    repo.create_aggregate(full_resume())
    main = rows(db_path, "SELECT * FROM resumes")[0]
    assert (main["name"], main["phone"], main["email"]) == (
        "ZZ合成姓名",
        "13800138000",
        "zz@example.com",
    )
    assert main["job_title"] == "后端工程师" and main["self_evaluation"] == "自评"
    assert main["created_at"] == main["updated_at"] == T0
    assert main["file_path"].endswith(".pdf") and main["file_size"] == 100
    assert count(db_path, "resume_work_experiences") == 2
    assert count(db_path, "resume_project_experiences") == 1
    assert count(db_path, "resume_educations") == 3


def test_json_lists_keep_unicode_and_empty_lists(repo: ResumeRepository, db_path: Path) -> None:
    repo.create_aggregate(full_resume())
    main = rows(db_path, "SELECT * FROM resumes")[0]
    assert main["strengths_json"] == '["沟通"]'
    assert main["skills_json"] == '["Python", "SQL"]'
    assert main["certificates_honors_json"] == "[]"
    assert rows(db_path, "SELECT json_valid(languages_json) AS v FROM resumes")[0]["v"] == 1


def test_sub_rows_keep_order_and_values(repo: ResumeRepository, db_path: Path) -> None:
    repo.create_aggregate(full_resume())
    work = rows(db_path, "SELECT * FROM resume_work_experiences ORDER BY seq")
    assert [(w["seq"], w["company"]) for w in work] == [(0, "甲公司"), (1, "乙公司")]
    assert work[0]["responsibilities_json"] == '["开发"]' and work[1]["achievements_json"] == "[]"
    assert work[0]["created_at"] == work[0]["updated_at"] == T0
    edu = rows(db_path, "SELECT seq, school FROM resume_educations ORDER BY seq")
    assert [(e["seq"], e["school"]) for e in edu] == [(0, "示例大学"), (1, "示例学院"), (2, None)]
    assert {r["resume_id"] for r in rows(db_path, "SELECT resume_id FROM resume_educations")} == {
        make_resume().id
    }


def test_unset_scalars_are_null_and_blocks_are_empty(repo: ResumeRepository, db_path: Path) -> None:
    repo.create_aggregate(make_resume())
    main = rows(db_path, "SELECT * FROM resumes")[0]
    assert main["job_title"] is None and main["gender"] is None and main["self_evaluation"] is None
    assert main["strengths_json"] == "[]"
    assert count(db_path, "resume_work_experiences") == 0


def test_values_are_parameter_bound(repo: ResumeRepository, db_path: Path) -> None:
    evil = "x'); DROP TABLE resumes; --"
    repo.create_aggregate(make_resume(name=evil, job_title=evil))
    assert rows(db_path, "SELECT name FROM resumes")[0]["name"] == evil
    assert count(db_path, "resumes") == 1


# ---- idempotency key -----------------------------------------------------------------------


def test_find_by_identity_key(repo: ResumeRepository) -> None:
    rec = make_resume(1)
    repo.create_aggregate(rec)
    ref = repo.find_by_identity_key(rec.name_key, rec.phone_key, rec.email_key)
    assert ref == ResumeRef(id=rec.id, file_path=rec.file_path, created_at=T0)


@pytest.mark.parametrize("which", ["name_key", "phone_key", "email_key"])
def test_find_requires_all_three_keys(repo: ResumeRepository, which: str) -> None:
    rec = make_resume(1)
    repo.create_aggregate(rec)
    keys = {"name_key": rec.name_key, "phone_key": rec.phone_key, "email_key": rec.email_key}
    keys[which] = "different"
    assert repo.find_by_identity_key(**keys) is None


def test_duplicate_identity_raises_and_writes_nothing(
    repo: ResumeRepository, db_path: Path
) -> None:
    repo.create_aggregate(make_resume(1, name_key="same", work_experiences=[WorkExperience()]))
    dup = make_resume(2, name_key="same", work_experiences=[WorkExperience(), WorkExperience()])
    with pytest.raises(DuplicateIdentityError):
        repo.create_aggregate(dup)
    assert count(db_path, "resumes") == 1
    assert count(db_path, "resume_work_experiences") == 1  # the duplicate's sub rows rolled back


def test_other_integrity_errors_are_not_swallowed_as_duplicates(
    repo: ResumeRepository, db_path: Path
) -> None:
    repo.create_aggregate(make_resume(1, file_path="same.pdf"))
    with pytest.raises(sqlite3.IntegrityError, match="file_path") as ei:
        repo.create_aggregate(make_resume(2, file_path="same.pdf"))
    assert not isinstance(ei.value, DuplicateIdentityError)
    with pytest.raises(sqlite3.IntegrityError, match="CHECK"):
        repo.create_aggregate(make_resume(3, content_type="text/plain"))
    with pytest.raises(sqlite3.IntegrityError):
        repo.create_aggregate(make_resume(4, name="   "))
    assert count(db_path, "resumes") == 1


def test_failure_in_a_later_table_rolls_everything_back(
    repo: ResumeRepository, db_path: Path
) -> None:
    conn = connect(db_path)
    conn.execute(
        "CREATE TRIGGER fail_edu BEFORE INSERT ON resume_educations "
        "BEGIN SELECT RAISE(ABORT, 'injected failure'); END"
    )
    conn.close()
    rec = make_resume(
        work_experiences=[WorkExperience(company="甲")],
        project_experiences=[ProjectExperience(name="项目")],
        educations=[Education(school="校")],
    )
    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        repo.create_aggregate(rec)
    for table in (
        "resumes",
        "resume_work_experiences",
        "resume_project_experiences",
        "resume_educations",
    ):
        assert count(db_path, table) == 0
    # the repository is still usable afterwards
    connect(db_path).execute("DROP TRIGGER fail_edu")
    repo.create_aggregate(make_resume(5))
    assert count(db_path, "resumes") == 1


def test_concurrent_same_identity_yields_exactly_one_record(
    repo: ResumeRepository, db_path: Path
) -> None:
    barrier = threading.Barrier(4)
    outcomes: list[str] = []

    def work(n: int) -> None:
        barrier.wait(5)
        try:
            repo.create_aggregate(make_resume(n, name_key="race", educations=[Education()]))
            outcomes.append("created")
        except DuplicateIdentityError:
            outcomes.append("duplicate")

    threads = [threading.Thread(target=work, args=(n,)) for n in range(1, 5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes) == ["created", "duplicate", "duplicate", "duplicate"]
    assert count(db_path, "resumes") == 1 and count(db_path, "resume_educations") == 1


def test_list_refs(repo: ResumeRepository) -> None:
    assert repo.list_refs() == []
    repo.create_aggregate(make_resume(1))
    repo.create_aggregate(make_resume(2))
    assert {r.id for r in repo.list_refs()} == {make_resume(1).id, make_resume(2).id}
    assert {r.file_path for r in repo.list_refs()} == {
        make_resume(1).file_path,
        make_resume(2).file_path,
    }


# ---- v2: read side and in-place replace ------------------------------------------------------

T1 = "2026-11-12T09:00:00Z"


def test_reader_protocol_exposes_no_write_method() -> None:
    hints = ResumeReader.__dict__
    public = {n for n in hints if not n.startswith("_")}
    assert public == {"find_by_identity_key", "list_summaries", "get_detail", "get_names"}


def test_list_summaries_newest_first_and_get_names(repo: ResumeRepository) -> None:
    repo.create_aggregate(make_resume(1, created_at="2026-11-10T08:00:00Z"))
    repo.create_aggregate(make_resume(2, created_at="2026-11-11T08:00:00Z", name="乙"))
    assert [r.id for r in repo.list_summaries()] == [make_resume(2).id, make_resume(1).id]
    assert repo.list_summaries()[0].email == "zz@example.com"
    names = repo.get_names([make_resume(1).id, make_resume(2).id, "missing"])
    assert names == {make_resume(1).id: "ZZ合成姓名", make_resume(2).id: "乙"}
    assert repo.get_names([]) == {}


def test_get_detail_round_trips_values_without_statuses(repo: ResumeRepository) -> None:
    repo.create_aggregate(full_resume())
    detail = repo.get_detail(make_resume().id)
    assert detail is not None
    v = detail.values
    assert (v.name, v.job_title, v.gender) == ("ZZ合成姓名", "后端工程师", None)
    assert v.skills == ["Python", "SQL"] and v.languages == ["英语"] and v.certificates_honors == []
    assert [w.company for w in v.work_experiences] == ["甲公司", "乙公司"]
    assert v.work_experiences[0].responsibilities == ["开发"]
    assert [e.school for e in v.educations] == ["示例大学", "示例学院", None]
    assert (detail.created_at, detail.updated_at, detail.content_type) == (
        T0,
        T0,
        "application/pdf",
    )
    assert repo.get_detail("missing") is None


def test_replace_aggregate_updates_in_place_and_returns_old_path(
    repo: ResumeRepository, db_path: Path
) -> None:
    repo.create_aggregate(full_resume())
    new = make_resume(
        job_title="架构师", file_path="new-version.png", content_type="image/png",
        skills=["Go"], work_experiences=[WorkExperience(company="丙公司")],
        project_experiences=[], educations=[Education(school="新大学")],
    )  # fmt: skip
    assert repo.replace_aggregate(new, T1) == full_resume().file_path
    main = rows(db_path, "SELECT * FROM resumes")[0]
    assert (main["job_title"], main["file_path"], main["content_type"]) == (
        "架构师", "new-version.png", "image/png",
    )  # fmt: skip
    assert (main["created_at"], main["updated_at"]) == (T0, T1)
    assert main["skills_json"] == '["Go"]'
    assert [r["company"] for r in rows(db_path, "SELECT company FROM resume_work_experiences")] == [
        "丙公司"
    ]
    assert count(db_path, "resume_project_experiences") == 0
    edu = rows(db_path, "SELECT school, created_at, updated_at FROM resume_educations")
    assert [(e["school"], e["created_at"], e["updated_at"]) for e in edu] == [("新大学", T1, T1)]
    assert count(db_path, "resumes") == 1


def test_replace_aggregate_guard_failure_changes_nothing(
    repo: ResumeRepository, db_path: Path
) -> None:
    repo.create_aggregate(full_resume())
    before = [tuple(r) for r in rows(db_path, "SELECT * FROM resumes")]
    with pytest.raises(ResumeConflictError):
        repo.replace_aggregate(make_resume(name_key="changed", job_title="X"), T1)
    with pytest.raises(ResumeConflictError):
        repo.replace_aggregate(make_resume(9), T1)  # no such record
    assert [tuple(r) for r in rows(db_path, "SELECT * FROM resumes")] == before
    assert count(db_path, "resume_work_experiences") == 2


def test_replace_aggregate_failure_inside_transaction_rolls_back_everything(
    repo: ResumeRepository, db_path: Path
) -> None:
    repo.create_aggregate(full_resume())
    repo.create_aggregate(make_resume(2, file_path="other.pdf"))
    before = [tuple(r) for r in rows(db_path, "SELECT * FROM resumes ORDER BY id")]
    sub_before = count(db_path, "resume_work_experiences")
    with pytest.raises(sqlite3.IntegrityError):  # file_path already used by another record
        repo.replace_aggregate(make_resume(1, file_path="other.pdf", job_title="X"), T1)
    assert [tuple(r) for r in rows(db_path, "SELECT * FROM resumes ORDER BY id")] == before
    assert count(db_path, "resume_work_experiences") == sub_before
