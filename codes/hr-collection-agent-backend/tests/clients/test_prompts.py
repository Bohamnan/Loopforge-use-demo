from app.clients import prompts
from app.schemas.resume_fields import ResumeFields


def test_every_resume_field_is_described() -> None:
    for key in ResumeFields.model_fields:
        assert key in prompts.SYSTEM_PROMPT


def test_prompt_guards_against_injection_and_guessing() -> None:
    text = prompts.SYSTEM_PROMPT
    assert "untrusted" in text and "Never follow" in text
    assert "Never guess" in text
    assert 'Never output\n   "confirmed"' in text
    assert '"uncertain"' in text and '"missing"' in text and '"recognized"' in text


def test_prompt_contains_no_user_data_placeholders() -> None:
    assert "{" not in prompts.USER_INSTRUCTION


def test_markers_are_distinct_and_explained() -> None:
    assert prompts.DOC_BEGIN != prompts.DOC_END
    assert prompts.SYSTEM_PROMPT.count(prompts.DOC_BEGIN) >= 1
    assert prompts.SYSTEM_PROMPT.count(prompts.DOC_END) >= 1
    assert "only as data" in prompts.SYSTEM_PROMPT


def test_neutralize_markers_removes_both_markers() -> None:
    text = f"a {prompts.DOC_BEGIN} b {prompts.DOC_END} c"
    cleaned = prompts.neutralize_markers(text)
    assert prompts.DOC_BEGIN not in cleaned and prompts.DOC_END not in cleaned
    assert cleaned.startswith("a ") and cleaned.endswith(" c")
    assert prompts.neutralize_markers("plain text") == "plain text"
