import { FIELD_STATUSES, RESUME_FIELD_KEYS } from '../types/ResumeModel';

// Minimal shape checks for 2xx bodies. A gateway or proxy can answer 200 with some unrelated JSON;
// without these checks that would be read as a successful save (F-03) or crash the review screen.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LIST_FIELDS: readonly string[] = [
  'strengths',
  'work_experiences',
  'project_experiences',
  'educations',
  'skills',
  'certificates_honors',
  'languages',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** POST /resumes: resume_id (non-empty string), already_saved (boolean), saved_at (a parseable date string). */
export function isCreateResumeResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.resume_id) &&
    typeof value.already_saved === 'boolean' &&
    typeof value.saved_at === 'string' &&
    !Number.isNaN(Date.parse(value.saved_at))
  );
}

function isFieldEntry(key: string, entry: unknown): boolean {
  if (!isRecord(entry) || !(FIELD_STATUSES as readonly string[]).includes(entry.status as string) || !('value' in entry)) {
    return false;
  }
  if (LIST_FIELDS.includes(key)) {
    return Array.isArray(entry.value);
  }
  return entry.value === null || typeof entry.value === 'string';
}

/** Draft responses: the screen reads all 22 fields (value + status) and the original file name. */
export function isDraftResponse(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.draft_id) || !isNonEmptyString(value.expires_at)) {
    return false;
  }
  if (!isRecord(value.original_file) || !isNonEmptyString(value.original_file.filename)) {
    return false;
  }
  const fields = value.fields;
  return isRecord(fields) && RESUME_FIELD_KEYS.every((key) => isFieldEntry(key, fields[key]));
}
