"""Field limits and patterns; single source mirrored from OpenAPI 0.2.0 (CR-01, G-01, G-02)."""

NAME_MAX = 100
PHONE_MAX = 32
EMAIL_MAX = 254
SCALAR_MAX = 500
SELF_EVALUATION_MAX = 5000
TEXT_LIST_MAX_ITEMS = 50
TEXT_LIST_ITEM_MAX = 1000
BLOCK_MAX_ENTRIES = 20
ENTRY_STRING_MAX = 2000
ENTRY_LIST_MAX_ITEMS = 30

# Applied by field_validation to the value after spaces and hyphens are stripped (G-02).
PHONE_PATTERN = r"^(1\d{10}|\+\d{6,15})$"
EMAIL_PATTERN = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"

# Chat (v2, REQ-BE-07). Mirrors OpenAPI 0.2.0 SendMessageRequest and design 1.
MESSAGE_MAX = 2000  # user message length, characters
HISTORY_WINDOW = 20  # most recent messages sent to the model
REPLY_MAX = 4000  # assistant reply is truncated to this length

# Fields a suggestion may target (OpenAPI SuggestionField): scalars + 4 text lists,
# never work/project/education blocks (B-04).
SUGGESTION_SCALAR_FIELDS = (
    "name", "job_title", "expected_city", "expected_salary", "available_time", "phone",
    "email", "homepage", "gender", "birth_month", "political_status", "current_city",
    "work_years", "highest_education", "self_evaluation",
)  # fmt: skip
SUGGESTION_LIST_FIELDS = ("strengths", "skills", "certificates_honors", "languages")
SUGGESTION_FIELDS = SUGGESTION_SCALAR_FIELDS + SUGGESTION_LIST_FIELDS
