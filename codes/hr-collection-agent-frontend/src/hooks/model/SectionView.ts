import {
  FIELD_STATUSES,
  RESUME_FIELD_KEYS,
  type FieldStatus,
  type ResumeFieldKey,
  type ResumeFields,
  type ResumeFieldsUpdate,
} from '../../types/ResumeModel';
import { validateCore } from './FieldRules';
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
