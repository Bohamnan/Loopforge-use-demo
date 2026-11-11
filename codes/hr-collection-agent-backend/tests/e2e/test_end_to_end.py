"""End-to-end flows through the real application (task 3.2). Two paths, synthetic data only.

Path 1: upload, chat, apply a suggestion, save, then the same person uploads again and confirms
an update. Path 2: a saved session is read-only, the archive serves the file, and deleting the
session leaves the record and its file in place.
"""

import re

from tests.e2e.support import (
    CV,
    CV_REVISED,
    EMAIL,
    NAME,
    PHONE,
    RESUMES,
    SESSIONS,
    World,
    chat_reply,
    parse_reply,
)


def test_upload_chat_apply_save_then_update_for_the_same_person(world: World) -> None:
    world.model.expect(parse_reply())
    created = world.upload()
    assert created.status_code == 201, created.text
    sid = created.json()["session_id"]

    world.model.expect(chat_reply("已记录工作年限", [{"field": "work_years", "value": "7 年"}]))
    sent = world.client.post(f"{SESSIONS}/{sid}/messages", json={"content": "工作年限改成 7 年"})
    assert sent.status_code == 201, sent.text
    card = sent.json()["assistant_message"]
    assert card["suggestions"][0]["applicable"] is True
    mid = card["message_id"]

    applied = world.client.post(f"{SESSIONS}/{sid}/messages/{mid}/apply")
    assert applied.status_code == 200, applied.text
    assert applied.json()["fields"]["work_years"] == {"value": "7 年", "status": "confirmed"}

    saved = world.client.post(f"{SESSIONS}/{sid}/resume", json={"confirmed": True})
    assert saved.status_code == 201 and saved.json()["already_saved"] is False
    resume_id = saved.json()["resume_id"]

    world.model.expect(parse_reply())
    second_sid = world.upload(CV_REVISED).json()["session_id"]
    matched = world.client.post(f"{SESSIONS}/{second_sid}/resume", json={"confirmed": True})
    assert matched.status_code == 200 and matched.json()["already_saved"] is True
    assert matched.json()["resume_id"] == resume_id

    updated = world.client.put(f"{SESSIONS}/{second_sid}/resume", json={"confirm_update": True})
    assert updated.status_code == 200, updated.text
    assert updated.json()["resume_id"] == resume_id

    # Check the stored data, not only the status codes.
    assert world.rows("resumes.db", "SELECT count(*) FROM resumes") == [(1,)]
    (archived,) = world.archive_names()  # the old file is gone, one final file remains
    assert re.fullmatch(rf"{resume_id}-[0-9a-f]{{8}}\.pdf", archived)
    assert world.rows("resumes.db", "SELECT file_path FROM resumes") == [(archived,)]
    assert (world.settings.file_dir / archived).read_bytes() == CV_REVISED
    # Overwrite, not merge: the first save's "7 年" is gone because the update did not carry it.
    assert world.rows("resumes.db", "SELECT work_years, phone, email FROM resumes") == [
        (None, PHONE, EMAIL)
    ]
    assert world.rows("drafts.db", "SELECT status, update_state FROM sessions WHERE id = ?",
                      (second_sid,)) == [("saved", "applied")]  # fmt: skip
    assert world.draft_names() == []  # no temporary files left behind
    assert world.model.calls == 3  # two parses and one chat; saving and updating never call it


def test_saved_session_is_read_only_and_the_archive_serves_the_file(world: World) -> None:
    world.model.expect(parse_reply())
    sid = world.upload().json()["session_id"]
    confirm = world.client.post(f"{SESSIONS}/{sid}/resume", json={"confirmed": True})
    resume_id = confirm.json()["resume_id"]

    detail = world.client.get(f"{SESSIONS}/{sid}").json()
    assert detail["status"] == "saved" and detail["fields"] is None
    assert detail["resume"]["fields"]["name"] == NAME  # values only, no field status
    assert world.client.patch(
        f"{SESSIONS}/{sid}/fields", json={"fields": {"skills": []}}
    ).status_code == 409  # fmt: skip
    assert world.client.post(
        f"{SESSIONS}/{sid}/messages", json={"content": "hi"}
    ).status_code == 409  # fmt: skip

    listed = world.client.get(RESUMES).json()["items"]
    assert [item["resume_id"] for item in listed] == [resume_id]
    record = world.client.get(f"{RESUMES}/{resume_id}").json()
    assert record["file_available"] is True and record["fields"]["phone"] == PHONE

    download = world.client.get(f"{RESUMES}/{resume_id}/file")
    assert download.status_code == 200 and download.content == CV
    assert download.headers["x-content-type-options"] == "nosniff"

    assert world.client.delete(f"{SESSIONS}/{sid}").status_code == 204
    assert world.client.get(f"{SESSIONS}/{sid}").status_code == 404
    assert world.rows("resumes.db", "SELECT count(*) FROM resumes") == [(1,)]  # B-05
    assert world.archive_names() == [f"{resume_id}.pdf"]
    assert [item["resume_id"] for item in world.client.get(RESUMES).json()["items"]] == [resume_id]
