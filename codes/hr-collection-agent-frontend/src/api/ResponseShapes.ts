import { CHAT_ROLES, SUGGESTION_REASONS, SUGGESTION_STATUSES } from '../types/Conversation';
import { FIELD_STATUSES, RESUME_FIELD_KEYS, SUGGESTION_FIELDS } from '../types/ResumeModel';
import { SESSION_STATUSES, UPDATE_STATES } from '../types/Session';

// Minimal shape checks for 2xx bodies (OpenAPI 0.2.0). A gateway or proxy can answer 200 with some unrelated JSON;
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

const isDate = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const oneOf = (list: readonly string[], value: unknown): boolean => typeof value === 'string' && list.includes(value);
const isArrayOf = (value: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(check);

function isOriginalFile(file: unknown): boolean {
  return (
    isRecord(file) &&
    isNonEmptyString(file.filename) &&
    oneOf(CONTENT_TYPES, file.content_type) &&
    typeof file.size_bytes === 'number' &&
    Number.isFinite(file.size_bytes) &&
    file.size_bytes >= 0
  );
}

/** ResumeFields: all 22 fields with value + status (reviewing sessions, PATCH and apply/cancel responses). */
function isResumeFields(fields: unknown): boolean {
  return isRecord(fields) && RESUME_FIELD_KEYS.every((key) => isFieldEntry(key, fields[key]));
}

/** ResumeValues: all 22 fields, values only. */
function isResumeValues(values: unknown): boolean {
  if (!isRecord(values)) return false;
  return RESUME_FIELD_KEYS.every((key) =>
    LIST_FIELDS.includes(key) ? isListValue(key, values[key]) : values[key] === null || typeof values[key] === 'string',
  );
}

export function isArchivedResume(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.resume_id) &&
    isResumeValues(value.fields) &&
    isOriginalFile(value.original_file) &&
    typeof value.file_available === 'boolean' &&
    isDate(value.saved_at) &&
    isDate(value.updated_at)
  );
}

function isSuggestionValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || isStringArray(value);
}

/** A suggestion outside the 19-field whitelist is a shape error (labelOfField would throw on it). */
function isSuggestion(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.suggestion_id) &&
    oneOf(SUGGESTION_FIELDS, value.field) &&
    isSuggestionValue(value.old_value) &&
    isSuggestionValue(value.new_value) &&
    typeof value.applicable === 'boolean' &&
    (value.reason === null || oneOf(SUGGESTION_REASONS, value.reason)) &&
    oneOf(SUGGESTION_STATUSES, value.status)
  );
}

function isChatMessage(value: unknown, role?: string): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.message_id) &&
    oneOf(role ? [role] : CHAT_ROLES, value.role) &&
    typeof value.content === 'string' &&
    isArrayOf(value.suggestions, isSuggestion) &&
    isDate(value.created_at)
  );
}

function isSessionSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.session_id) &&
    typeof value.name === 'string' &&
    oneOf(SESSION_STATUSES, value.status) &&
    isDate(value.last_active_at)
  );
}

export const isSessionList = (value: unknown): boolean => isRecord(value) && isArrayOf(value.items, isSessionSummary);

/**
 * GET/POST session: status, update_state and fields / resume / update_candidate must agree
 * (reviewing: fields only; saved: resume, plus the candidate only when pending). Anything else is not trusted.
 */
export function isSessionDetail(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.session_id) ||
    typeof value.name !== 'string' ||
    !oneOf(SESSION_STATUSES, value.status) ||
    !oneOf(UPDATE_STATES, value.update_state) ||
    !isOriginalFile(value.original_file) ||
    !isArrayOf(value.messages, isChatMessage) ||
    !isDate(value.created_at) ||
    !isDate(value.updated_at) ||
    !isDate(value.last_active_at)
  ) {
    return false;
  }
  const candidate = value.update_candidate;
  const candidateOk = isRecord(candidate) && isResumeValues(candidate.fields) && isOriginalFile(candidate.original_file);
  if (value.status === 'reviewing') {
    return value.update_state === 'none' && isResumeFields(value.fields) && value.resume === null && candidate === null;
  }
  if (value.fields !== null || !isArchivedResume(value.resume)) return false;
  return value.update_state === 'pending' ? candidateOk : candidate === null;
}

export function isSendMessageResponse(value: unknown): boolean {
  return isRecord(value) && isChatMessage(value.user_message, 'user') && isChatMessage(value.assistant_message, 'assistant');
}

export function isSuggestionActionResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.message_id) &&
    isArrayOf(value.suggestions, isSuggestion) &&
    isResumeFields(value.fields) &&
    isDate(value.updated_at)
  );
}

export function isSessionFieldsResponse(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.session_id) && isResumeFields(value.fields) && isDate(value.updated_at);
}

/** PUT /sessions/{id}/resume: only a well-formed answer may lead to "已更新" (F-03). */
export function isUpdateResumeResponse(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.resume_id) && isDate(value.updated_at);
}

function isResumeSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.resume_id) &&
    typeof value.name === 'string' &&
    typeof value.phone === 'string' &&
    typeof value.email === 'string' &&
    (value.job_title === null || typeof value.job_title === 'string') &&
    isDate(value.saved_at)
  );
}

export const isResumeList = (value: unknown): boolean => isRecord(value) && isArrayOf(value.items, isResumeSummary);
