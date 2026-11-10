import type { ErrorDetail, ErrorReason } from '../../types/Errors';
import { RESUME_FIELD_KEYS, type ResumeFieldKey } from '../../types/ResumeModel';

// Validation rules mirrored from OpenAPI 0.1.1 (ResumeFieldsUpdate and its sub-schemas).
// The OpenAPI is the single source (O-05, G-01, G-02, CR-01, CR-01a); re-check on every contract change.

/** phone.pattern; applies to the value AFTER spaces and hyphens are removed (G-02). */
export const PHONE_PATTERN = /^(1\d{10}|\+\d{6,15})$/;

/** email.pattern (G-01); deliberately loose, only blocks obvious mistakes. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

export interface FieldLimit {
  /** Max characters of a scalar field. */
  maxLength?: number;
  /** Max items of a list field. */
  maxItems?: number;
  /** Max characters of each item of a text list. */
  itemMaxLength?: number;
}

const LONG_TEXT_LIST: FieldLimit = { maxItems: 50, itemMaxLength: 1000 };
const SHORT_SCALAR: FieldLimit = { maxLength: 500 };

/** Length / count limits of the 22 fields (design §6.1; OpenAPI 0.1.1 ResumeFieldsUpdate). */
export const FIELD_MAX_LENGTH: Readonly<Record<ResumeFieldKey, FieldLimit>> = {
  name: { maxLength: 100 },
  job_title: SHORT_SCALAR,
  expected_city: SHORT_SCALAR,
  expected_salary: SHORT_SCALAR,
  available_time: SHORT_SCALAR,
  phone: { maxLength: 32 },
  email: { maxLength: EMAIL_MAX_LENGTH },
  homepage: SHORT_SCALAR,
  gender: SHORT_SCALAR,
  birth_month: SHORT_SCALAR,
  political_status: SHORT_SCALAR,
  current_city: SHORT_SCALAR,
  work_years: SHORT_SCALAR,
  highest_education: SHORT_SCALAR,
  strengths: LONG_TEXT_LIST,
  work_experiences: { maxItems: 20 },
  project_experiences: { maxItems: 20 },
  educations: { maxItems: 20 },
  skills: LONG_TEXT_LIST,
  certificates_honors: LONG_TEXT_LIST,
  languages: LONG_TEXT_LIST,
  self_evaluation: { maxLength: 5000 },
};

/** Limits inside one experience item (WorkExperience / ProjectExperience / Education; CR-01a). */
export const EXPERIENCE_ITEM_LIMIT = {
  /** Every string sub-field. */
  maxLength: 2000,
  /** responsibilities / achievements: max entries. */
  listMaxItems: 30,
  /** responsibilities / achievements: max characters per entry. */
  listItemMaxLength: 2000,
} as const;

const CORE_KEYS = ['name', 'phone', 'email'] as const;
export type CoreKey = (typeof CORE_KEYS)[number];

/** Length in Unicode characters (code points), like JSON Schema / Python `maxLength`; `.length` would count UTF-16 units. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/** Removes spaces and hyphens; the submitted phone value must be normalised first (G-02). */
export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return charLength(normalized) <= (FIELD_MAX_LENGTH.phone.maxLength ?? Infinity) && PHONE_PATTERN.test(normalized);
}

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return charLength(trimmed) <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(trimmed);
}

/**
 * Value to put into a PATCH body for a scalar field: trimmed, phone normalised,
 * blank non-core values become null (confirm as empty). Blank core values stay '' so validation rejects them.
 */
export function toSubmitScalar(key: ResumeFieldKey, value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (key === 'phone') {
    return normalizePhone(trimmed);
  }
  if (trimmed === '') {
    return (CORE_KEYS as readonly string[]).includes(key) ? '' : null;
  }
  return trimmed;
}

/** Validates one scalar field as it would be submitted. Returns the failing reason, or null when valid. */
export function validateScalar(key: ResumeFieldKey, value: string | null): ErrorReason | null {
  const submitted = toSubmitScalar(key, value);
  const isCore = (CORE_KEYS as readonly string[]).includes(key);
  if (submitted === null || submitted === '') {
    return isCore ? 'required' : null;
  }
  const max = FIELD_MAX_LENGTH[key].maxLength;
  if (max !== undefined && charLength(submitted) > max) {
    return 'too_long';
  }
  if (key === 'phone' && !PHONE_PATTERN.test(submitted)) {
    return 'invalid_format';
  }
  if (key === 'email' && !EMAIL_PATTERN.test(submitted)) {
    return 'invalid_format';
  }
  return null;
}

/** Validates name / phone / email together; returns only the failing ones. */
export function validateCore(values: Record<CoreKey, string | null>): Partial<Record<CoreKey, ErrorReason>> {
  const result: Partial<Record<CoreKey, ErrorReason>> = {};
  for (const key of CORE_KEYS) {
    const reason = validateScalar(key, values[key]);
    if (reason) {
      result[key] = reason;
    }
  }
  return result;
}

/**
 * Validates a text list. Blank rows are ignored (they are not submitted): they do not count against the item limit,
 * but the index of a too-long item is its position among the rows the user sees.
 */
export function validateStringList(
  key: ResumeFieldKey,
  items: readonly string[],
): { reason: ErrorReason; index?: number } | null {
  const limit = FIELD_MAX_LENGTH[key];
  const filled = items.filter((item) => item.trim() !== '');
  if (limit.maxItems !== undefined && filled.length > limit.maxItems) {
    return { reason: 'too_long' };
  }
  if (limit.itemMaxLength !== undefined) {
    const index = items.findIndex((item) => charLength(item) > (limit.itemMaxLength as number));
    if (index >= 0) {
      return { reason: 'too_long', index };
    }
  }
  return null;
}

/** Validates an experience list; error paths use the backend format, e.g. work_experiences[1].company. */
export function validateObjectList(
  key: ResumeFieldKey,
  items: readonly Record<string, unknown>[],
): ErrorDetail[] {
  const maxItems = FIELD_MAX_LENGTH[key].maxItems;
  if (maxItems !== undefined && items.length > maxItems) {
    return [{ field: key, reason: 'too_long' }];
  }
  const errors: ErrorDetail[] = [];
  items.forEach((item, index) => {
    for (const [sub, value] of Object.entries(item)) {
      const path = `${key}[${index}].${sub}`;
      if (typeof value === 'string') {
        if (charLength(value) > EXPERIENCE_ITEM_LIMIT.maxLength) {
          errors.push({ field: path, reason: 'too_long' });
        }
      } else if (Array.isArray(value)) {
        const filled = value.filter((entry) => typeof entry !== 'string' || entry.trim() !== '');
        if (filled.length > EXPERIENCE_ITEM_LIMIT.listMaxItems) {
          errors.push({ field: path, reason: 'too_long' });
          continue;
        }
        value.forEach((entry, entryIndex) => {
          if (typeof entry === 'string' && charLength(entry) > EXPERIENCE_ITEM_LIMIT.listItemMaxLength) {
            errors.push({ field: `${path}[${entryIndex}]`, reason: 'too_long' });
          }
        });
      }
    }
  });
  return errors;
}

const REASON_TEXT: Record<ErrorReason, string> = {
  required: '必填',
  invalid_format: '格式不正确',
  invalid_type: '类型不符',
  too_long: '内容过长',
  // The frontend should never send undefined fields; treated as a generic internal error.
  unknown_field: '提交内容有误，请重试',
};

/** Frontend wording for an ErrorDetail.reason (the contract only gives the enum). */
export function reasonText(reason: ErrorReason): string {
  return REASON_TEXT[reason];
}

export interface ParsedFieldPath {
  field: ResumeFieldKey;
  /** Item index, e.g. 0 in work_experiences[0]. */
  index?: number;
  /** Sub-field name inside the item, e.g. start_date. */
  sub?: string;
  /** Entry index inside a sub list, e.g. 1 in responsibilities[1]. */
  subIndex?: number;
}

const PATH_PATTERN = /^([a-z_]+)(?:\[(\d+)\])?(?:\.([a-z_]+)(?:\[(\d+)\])?)?$/;

/** Parses an ErrorDetail.field such as work_experiences[0].start_date. Returns null if it is not a known field. */
export function parseFieldPath(path: string): ParsedFieldPath | null {
  const match = PATH_PATTERN.exec(path);
  if (!match) {
    return null;
  }
  const [, field, index, sub, subIndex] = match;
  if (!field || !(RESUME_FIELD_KEYS as readonly string[]).includes(field)) {
    return null;
  }
  const parsed: ParsedFieldPath = { field: field as ResumeFieldKey };
  if (index !== undefined) parsed.index = Number(index);
  if (sub !== undefined) parsed.sub = sub;
  if (subIndex !== undefined) parsed.subIndex = Number(subIndex);
  return parsed;
}
