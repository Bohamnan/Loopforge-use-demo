"""Business error model. Messages are fixed and never embed user data (B-03)."""

from dataclasses import dataclass
from enum import StrEnum


class ErrorCode(StrEnum):
    """Business error codes (same order as the OpenAPI ``ErrorCode`` enum)."""

    FILE_MISSING = "file_missing"
    FILE_EMPTY = "file_empty"
    FILE_CONTENT_MISMATCH = "file_content_mismatch"
    FILE_TOO_LARGE = "file_too_large"
    UNSUPPORTED_FILE_TYPE = "unsupported_file_type"
    PARSE_FAILED = "parse_failed"
    PARSE_UNAVAILABLE = "parse_unavailable"
    PARSE_TIMEOUT = "parse_timeout"
    DRAFT_NOT_FOUND = "draft_not_found"
    VALIDATION_FAILED = "validation_failed"
    CONFIRMATION_REQUIRED = "confirmation_required"
    SAVE_FAILED = "save_failed"
    INTERNAL_ERROR = "internal_error"


class IssueReason(StrEnum):
    """Reason codes allowed in ``details[].reason``."""

    REQUIRED = "required"
    INVALID_FORMAT = "invalid_format"
    INVALID_TYPE = "invalid_type"
    TOO_LONG = "too_long"
    UNKNOWN_FIELD = "unknown_field"


@dataclass(frozen=True)
class FieldIssue:
    """A field-level problem: field path and reason only, never the value."""

    field: str
    reason: IssueReason


class AppError(Exception):
    """Base class of errors that map to an HTTP error response."""

    code: ErrorCode
    http_status: int
    message: str

    def __init__(self) -> None:
        super().__init__(self.code.value)
        self.details: list[FieldIssue] | None = None


class FileMissingError(AppError):
    code = ErrorCode.FILE_MISSING
    http_status = 400
    message = "请选择要上传的简历文件。"


class FileEmptyError(AppError):
    code = ErrorCode.FILE_EMPTY
    http_status = 400
    message = "文件内容为空，请重新选择。"


class FileContentMismatchError(AppError):
    code = ErrorCode.FILE_CONTENT_MISMATCH
    http_status = 400
    message = "文件内容与格式不符，请上传有效的 PDF、JPG 或 PNG 文件。"


class FileTooLargeError(AppError):
    code = ErrorCode.FILE_TOO_LARGE
    http_status = 413
    message = "文件超过 10 MB，请压缩后重试。"


class UnsupportedFileTypeError(AppError):
    code = ErrorCode.UNSUPPORTED_FILE_TYPE
    http_status = 415
    message = "仅支持 PDF、JPG、JPEG、PNG 格式。"


class ParseFailedError(AppError):
    code = ErrorCode.PARSE_FAILED
    http_status = 502
    message = "简历解析失败，请更换文件后重新上传。"


class ParseUnavailableError(AppError):
    code = ErrorCode.PARSE_UNAVAILABLE
    http_status = 503
    message = "解析服务暂不可用，请稍后重试。"


class ParseTimeoutError(AppError):
    code = ErrorCode.PARSE_TIMEOUT
    http_status = 504
    message = "解析超时，请重新上传。"


class DraftNotFoundError(AppError):
    code = ErrorCode.DRAFT_NOT_FOUND
    http_status = 404
    message = "没有可恢复的草稿，请重新上传简历。"


class ValidationFailedError(AppError):
    """Field validation failed; the only error that carries ``details``."""

    code = ErrorCode.VALIDATION_FAILED
    http_status = 422
    message = "部分信息不符合要求，请修改后重试。"

    def __init__(self, details: list[FieldIssue] | None = None) -> None:
        super().__init__()
        self.details = list(details) if details else []


class ConfirmationRequiredError(AppError):
    code = ErrorCode.CONFIRMATION_REQUIRED
    http_status = 422
    message = "请先明确确认后再保存。"


class SaveFailedError(AppError):
    code = ErrorCode.SAVE_FAILED
    http_status = 500
    message = "保存失败，请稍后重试。"


class InternalError(AppError):
    code = ErrorCode.INTERNAL_ERROR
    http_status = 500
    message = "服务异常，请稍后重试。"


class DuplicateIdentityError(Exception):
    """Internal: the identity key already exists in the resumes table (not an HTTP error)."""
