import pytest

from app.services.identity_key import (
    build_identity,
    email_key,
    name_key,
    phone_key,
)


def test_name_key_trims_and_merges_whitespace() -> None:
    assert name_key("  ZZ   合成\t姓名 ") == "ZZ 合成 姓名"
    assert name_key("张三") == "张三"


def test_email_key_trims_and_lowercases() -> None:
    assert email_key("  Zz.User@Example.COM ") == "zz.user@example.com"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("13800138000", "13800138000"),
        ("138 0013 8000", "13800138000"),
        ("138-0013-8000", "13800138000"),
        ("+8613800138000", "13800138000"),
        ("+86 138-0013-8000", "13800138000"),
        ("8613800138000", "13800138000"),
        ("+85212345678", "+85212345678"),
        ("+861380013800", "+861380013800"),  # +86 followed by only 10 digits: keep
        ("+86138001380001", "+86138001380001"),  # 12 digits after +86: keep
        ("+8623800138000", "+8623800138000"),  # rest does not start with 1: keep
    ],
)
def test_phone_key(raw: str, expected: str) -> None:
    assert phone_key(raw) == expected


@pytest.mark.parametrize(
    "fn,value",
    [
        (name_key, "  A   B "),
        (email_key, " A@B.CC "),
        (phone_key, "+86 138-0013-8000"),
        (phone_key, "+85212345678"),
    ],
)
def test_normalisation_is_idempotent(fn, value: str) -> None:  # noqa: ANN001
    once = fn(value)
    assert fn(once) == once


def test_same_person_different_formatting_same_keys() -> None:
    a = build_identity("张三", "+8613800138000", "Zs@Example.com")
    b = build_identity(" 张三 ", "138-0013-8000", "zs@example.com ")
    assert (a.name_key, a.phone_key, a.email_key) == (b.name_key, b.phone_key, b.email_key)


def test_display_values_only_trim_edges() -> None:
    i = build_identity("  张  三 ", " 138 0013 8000 ", " Zs@Example.com ")
    assert i.name == "张  三"
    assert i.phone == "138 0013 8000"
    assert i.email == "Zs@Example.com"
    assert i.name_key == "张 三" and i.phone_key == "13800138000"
