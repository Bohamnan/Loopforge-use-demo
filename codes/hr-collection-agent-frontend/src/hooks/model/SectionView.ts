import type { ErrorReason } from '../../types/Errors';
import {
  FIELD_STATUSES,
  RESUME_FIELD_KEYS,
  type FieldStatus,
  type ResumeFieldKey,
  type ResumeFields,
  type ResumeFieldsUpdate,
} from '../../types/ResumeModel';
import {
  toSubmitScalar,
  validateCore,
  validateObjectList,
  validateScalar,
  validateStringList,
} from './FieldRules';
import { SECTIONS, type SectionConfig, type SectionKey } from './SectionConfig';

// Derived view data from the authoritative draft plus the unsubmitted edit buffer. Pure functions.

/** Higher number = needs more attention. */
const PRIORITY: Record<FieldStatus, number> = { confirmed: 0, recognized: 1, uncertain: 2, missing: 3 };

/** Section status = the highest-priority status among its fields (missing > uncertain > recognized > confirmed). */
export function sectionStatus(section: SectionConfig, fields: ResumeFields): FieldStatus {
  let result: FieldStatus = 'confirmed';
  for (const field of section.fields) {
    const status = fields[field.key].status;
    if (PRIORITY[status] > PRIORITY[result]) {
      result = status;
    }
  }
  return result;
}

/**
 * Section to open after upload / restore: the first with missing or uncertain fields,
 * otherwise the first with recognized fields, otherwise null (everything confirmed).
 */
export function firstTodoSection(fields: ResumeFields): SectionKey | null {
  const attention = SECTIONS.find((s) => {
    const status = sectionStatus(s, fields);
    return status === 'missing' || status === 'uncertain';
  });
  if (attention) {
    return attention.key;
  }
  return SECTIONS.find((s) => sectionStatus(s, fields) === 'recognized')?.key ?? null;
}

/**
 * name / phone / email are all confirmed on the server, hold valid values,
 * and have no unsubmitted edit (REQ-FE-04.1).
 */
export function coreReady(fields: ResumeFields, buffer: ResumeFieldsUpdate): boolean {
  const core = ['name', 'phone', 'email'] as const;
  if (core.some((key) => key in buffer || fields[key].status !== 'confirmed')) {
    return false;
  }
  const errors = validateCore({
    name: fields.name.value,
    phone: fields.phone.value,
    email: fields.email.value,
  });
  return Object.keys(errors).length === 0;
}

export function statusCounts(fields: ResumeFields): Record<FieldStatus, number> {
  const counts = Object.fromEntries(FIELD_STATUSES.map((s) => [s, 0])) as Record<FieldStatus, number>;
  for (const key of RESUME_FIELD_KEYS) {
    counts[fields[key].status] += 1;
  }
  return counts;
}

/** Number of fields whose status is not confirmed (REQ-FE-04.2). */
export function unconfirmedCount(fields: ResumeFields): number {
  return RESUME_FIELD_KEYS.filter((key) => fields[key].status !== 'confirmed').length;
}

export function hasUnsubmittedEdits(buffer: ResumeFieldsUpdate): boolean {
  return Object.keys(buffer).length > 0;
}

/** Field order inside a section: missing / uncertain first (highlighted), configured order otherwise. */
export function orderedFieldKeys(section: SectionConfig, fields: ResumeFields): ResumeFieldKey[] {
  const attention = (key: ResumeFieldKey) => fields[key].status === 'missing' || fields[key].status === 'uncertain';
  const keys = section.fields.map((f) => f.key);
  return [...keys.filter(attention), ...keys.filter((k) => !attention(k))];
}

function cleanStringList(items: readonly string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** Trims item strings (blank -> null) and cleans nested text lists; other values are kept as they are. */
function cleanItem(item: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string') {
      cleaned[key] = value.trim() === '' ? null : value.trim();
    } else if (Array.isArray(value)) {
      cleaned[key] = cleanStringList(value.filter((entry): entry is string => typeof entry === 'string'));
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Builds the PATCH body for confirming one section (design §4.4): every field of the section is sent,
 * taking the unsubmitted edit if present, else the current draft value (a missing scalar becomes null,
 * a missing list becomes []). Also returns local validation errors keyed by backend-style field path.
 * Blank text-list rows are dropped before the count / length checks, so indexes refer to the cleaned list.
 */
export function buildSectionUpdate(
  section: SectionConfig,
  fields: ResumeFields,
  buffer: ResumeFieldsUpdate,
): { update: ResumeFieldsUpdate; errors: Record<string, ErrorReason> } {
  const update: Record<string, unknown> = {};
  const errors: Record<string, ErrorReason> = {};

  for (const field of section.fields) {
    const key = field.key;
    const edited = key in buffer;
    const current = edited ? (buffer as Record<string, unknown>)[key] : fields[key].value;

    if (field.kind === 'text' || field.kind === 'textarea') {
      const raw = (current ?? null) as string | null;
      update[key] = toSubmitScalar(key, raw);
      const reason = validateScalar(key, raw);
      if (reason) errors[key] = reason;
    } else if (field.kind === 'stringList') {
      const cleaned = cleanStringList((current ?? []) as string[]);
      update[key] = cleaned;
      const problem = validateStringList(key, cleaned);
      if (problem) errors[problem.index === undefined ? key : `${key}[${problem.index}]`] = problem.reason;
    } else {
      const items = ((current ?? []) as Record<string, unknown>[]).map(cleanItem);
      update[key] = items;
      for (const detail of validateObjectList(key, items)) errors[detail.field] = detail.reason;
    }
  }
  return { update: update as ResumeFieldsUpdate, errors };
}

/** The value to display for a field: an unsubmitted edit if there is one, otherwise the saved draft value. */
export function currentValue(fields: ResumeFields, buffer: ResumeFieldsUpdate, key: ResumeFieldKey): unknown {
  return key in buffer ? (buffer as Record<string, unknown>)[key] : fields[key].value;
}

/**
 * Why the "confirm section" action is unavailable, or null when it is allowed.
 * Only the section holding name / phone / email can be blocked (they must be present and valid, REQ-FE-03.4).
 */
export function sectionConfirmBlock(section: SectionConfig, fields: ResumeFields, buffer: ResumeFieldsUpdate): string | null {
  if (!section.hasCore) return null;
  const errors = validateCore({
    name: currentValue(fields, buffer, 'name') as string | null,
    phone: currentValue(fields, buffer, 'phone') as string | null,
    email: currentValue(fields, buffer, 'email') as string | null,
  });
  return Object.keys(errors).length > 0 ? '请先补充并修正姓名、手机号、邮箱' : null;
}
