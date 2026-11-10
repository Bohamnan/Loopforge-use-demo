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

const SUB_LISTS: readonly string[] = ['responsibilities', 'achievements'];
const CONTENT_TYPES: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png'];

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** One experience item: an object whose known members are string / null, or string arrays for the two sub lists. */
function isExperienceItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  return Object.entries(item).every(([name, member]) => {
    if (SUB_LISTS.includes(name)) return isStringArray(member);
    return member === null || member === undefined || typeof member === 'string';
  });
}

function isListValue(key: string, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return key === 'work_experiences' || key === 'project_experiences' || key === 'educations'
    ? value.every(isExperienceItem)
    : isStringArray(value);
}

function isFieldEntry(key: string, entry: unknown): boolean {
  if (!isRecord(entry) || !(FIELD_STATUSES as readonly string[]).includes(entry.status as string) || !('value' in entry)) {
    return false;
  }
  if (LIST_FIELDS.includes(key)) {
    return isListValue(key, entry.value);
  }
  return entry.value === null || typeof entry.value === 'string';
}

/** Draft responses: the screen reads all 22 fields (value + status) and the original file name. */
export function isDraftResponse(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.draft_id) || !isNonEmptyString(value.expires_at)) {
    return false;
  }
  const file = value.original_file;
  if (!isRecord(file) || !isNonEmptyString(file.filename)) {
    return false;
  }
  if (typeof file.size_bytes !== 'number' || !Number.isFinite(file.size_bytes) || file.size_bytes < 0) {
    return false;
  }
  if (typeof file.content_type !== 'string' || !CONTENT_TYPES.includes(file.content_type)) {
    return false;
  }
  const fields = value.fields;
  return isRecord(fields) && RESUME_FIELD_KEYS.every((key) => isFieldEntry(key, fields[key]));
}
