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
