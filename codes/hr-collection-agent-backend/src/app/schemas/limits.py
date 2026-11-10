"""Field limits and patterns; single source mirrored from OpenAPI 0.1.1 (CR-01, G-01, G-02)."""

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
