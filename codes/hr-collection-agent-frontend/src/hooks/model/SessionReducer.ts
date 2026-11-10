import type { ApiError } from '../../api/ApiError';
import type { DraftResponse } from '../../types/Draft';
import type { ErrorReason } from '../../types/Errors';
import type { CreateResumeResponse } from '../../types/Resume';
import type { ResumeFieldKey, ResumeFieldsUpdate } from '../../types/ResumeModel';
import { parseFieldPath } from './FieldRules';
import { SECTIONS, getSection, sectionKeyOfField, type SectionKey } from './SectionConfig';
import {
  buildSectionUpdate,
  coreReady,
  firstTodoSection,
  hasUnsubmittedEdits,
  sectionStatus,
  unconfirmedCount,
} from './SectionView';
import { precheckFile } from './UploadPrecheck';

// The whole session state machine as one pure reducer (design §5.2 / §5.3). No side effects, no DOM.
// Requests are performed by useResumeSession, which dispatches the *_SUCCEEDED / *_FAILED results with the
// epoch it captured when the request started; results with another epoch or an unexpected busy state are dropped.

export type Phase = 'bootstrapping' | 'bootstrap_failed' | 'empty' | 'reviewing' | 'saved';
export type View = 'sections' | 'final';
export type Busy = null | 'upload' | 'patch' | 'confirm';
export type NoticeKind = 'restored' | 'draft_expired' | 'maybe_saved' | 'already_saved';
export type ErrorScope = 'bootstrap' | 'upload' | 'section' | 'confirm';
export type DialogKind = null | 'overwrite' | 'new_chat' | 'unconfirmed' | 'unsubmitted_edits';

/** A failure detected in the browser before any request (e.g. upload precheck). */
export interface LocalError {
  kind: 'local';
  message: string;
}

export interface SessionError {
  scope: ErrorScope;
  cause: ApiError | LocalError;
}

/** The only resume data kept after a successful save (design TD-11). */
export interface SavedSummary {
  name: string;
  filename: string;
  saved_at: string;
}

export interface SessionState {
  phase: Phase;
  view: View;
  busy: Busy;
  /** Bumped on every reset; async results carrying another epoch are discarded. */
  epoch: number;
  draft: DraftResponse | null;
  restored: boolean;
  activeSection: SectionKey;
  /** Unsubmitted edits, in memory only (F-02). */
  editBuffer: ResumeFieldsUpdate;
  /** Field-path -> reason, from local validation or backend 422 details. */
  fieldErrors: Record<string, ErrorReason>;
  notice: NoticeKind | null;
  error: SessionError | null;
  pendingFile: File | null;
  /** True after a confirmed "new chat": the next upload needs no second overwrite confirmation. */
  overwriteAcknowledged: boolean;
  savedSummary: SavedSummary | null;
  dialog: DialogKind;
}

export type SessionAction =
  | { type: 'BOOTSTRAP_RETRY' }
  | { type: 'BOOTSTRAP_SUCCEEDED'; draft: DraftResponse | null; epoch: number }
  | { type: 'BOOTSTRAP_FAILED'; error: ApiError; epoch: number }
  | { type: 'FILE_SELECTED'; file: File }
  | { type: 'OVERWRITE_CONFIRMED' }
  | { type: 'OVERWRITE_CANCELLED' }
  | { type: 'UPLOAD_SUCCEEDED'; draft: DraftResponse; epoch: number }
  | { type: 'UPLOAD_FAILED'; error: ApiError; epoch: number }
  | { type: 'FIELD_EDITED'; update: ResumeFieldsUpdate }
  | { type: 'SECTION_SELECTED'; section: SectionKey }
  | { type: 'SECTION_CONFIRM_REQUESTED'; section: SectionKey }
  | { type: 'PATCH_SUCCEEDED'; draft: DraftResponse; section: SectionKey; epoch: number }
  | { type: 'PATCH_FAILED'; error: ApiError; epoch: number }
  | { type: 'GO_FINAL_REQUESTED' }
  | { type: 'DISCARD_EDITS_AND_GO_FINAL' }
  | { type: 'BACK_TO_SECTIONS' }
  | { type: 'CONFIRM_REQUESTED' }
  | { type: 'CONFIRM_PROCEEDED' }
  | { type: 'CONFIRM_SUCCEEDED'; response: CreateResumeResponse; epoch: number }
  | { type: 'CONFIRM_FAILED'; error: ApiError; epoch: number }
  | { type: 'DIALOG_DISMISSED' }
  | { type: 'NEW_CHAT_REQUESTED' }
  | { type: 'NEW_CHAT_CONFIRMED' }
  | { type: 'UPLOAD_NEXT' }
  | { type: 'NOTICE_DISMISSED' };

export function initialState(): SessionState {
  return {
    phase: 'bootstrapping',
    view: 'sections',
    busy: null,
    epoch: 0,
    draft: null,
    restored: false,
    activeSection: 'basic',
    editBuffer: {},
    fieldErrors: {},
    notice: null,
    error: null,
    pendingFile: null,
    overwriteAcknowledged: false,
    savedSummary: null,
    dialog: null,
  };
}

/** Back to the empty state; keeps nothing of the previous resume. */
function resetToEmpty(state: SessionState, overwriteAcknowledged: boolean): SessionState {
  return {
    ...initialState(),
    phase: 'empty',
    epoch: state.epoch + 1,
    overwriteAcknowledged,
  };
}

/** Enters the review UI with a draft from the server (upload or restore). */
function enterReview(state: SessionState, draft: DraftResponse, restored: boolean): SessionState {
  const todo = firstTodoSection(draft.fields);
  return {
    ...state,
    phase: 'reviewing',
    view: todo === null ? 'final' : 'sections',
    busy: null,
    draft,
    restored,
    activeSection: todo ?? 'basic',
    editBuffer: {},
    fieldErrors: {},
    notice: restored ? 'restored' : null,
    error: null,
    pendingFile: null,
    overwriteAcknowledged: false,
    savedSummary: null,
    dialog: null,
  };
}

function fieldErrorsFromDetails(error: ApiError): Record<string, ErrorReason> {
  const result: Record<string, ErrorReason> = {};
  for (const detail of error.details ?? []) {
    result[detail.field] = detail.reason;
  }
  return result;
}

function sectionOfPath(path: string): SectionKey | null {
  const parsed = parseFieldPath(path);
  return parsed ? sectionKeyOfField(parsed.field) : null;
}

function isStale(state: SessionState, epoch: number, busy: Busy): boolean {
  return epoch !== state.epoch || state.busy !== busy;
}

/** The first section that is not fully confirmed, searching after `from` and then wrapping around. */
function nextUnconfirmedSection(draft: DraftResponse, from: SectionKey): SectionKey | null {
  const start = SECTIONS.findIndex((s) => s.key === from);
  const ordered = [...SECTIONS.slice(start + 1), ...SECTIONS.slice(0, start + 1)];
  return ordered.find((s) => sectionStatus(s, draft.fields) !== 'confirmed')?.key ?? null;
}

export type UploadDecision =
  | { kind: 'ignored' }
  | { kind: 'precheck_failed'; message: string }
  | { kind: 'needs_overwrite' }
  | { kind: 'start' };

/** Shared by the reducer and the hook so both agree on what a file selection does. */
export function decideUpload(state: SessionState, file: File): UploadDecision {
  if (state.busy !== null || state.dialog !== null) return { kind: 'ignored' };
  if (state.phase !== 'empty' && state.phase !== 'reviewing') return { kind: 'ignored' };
  const check = precheckFile(file);
  if (!check.ok) return { kind: 'precheck_failed', message: check.message };
  if (state.draft !== null && !state.overwriteAcknowledged) return { kind: 'needs_overwrite' };
  return { kind: 'start' };
}

function clearErrorsForFields(
  errors: Record<string, ErrorReason>,
  keys: readonly string[],
): Record<string, ErrorReason> {
  const result: Record<string, ErrorReason> = {};
  for (const [path, reason] of Object.entries(errors)) {
    if (!keys.includes(parseFieldPath(path)?.field ?? path)) {
      result[path] = reason;
    }
  }
  return result;
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'BOOTSTRAP_RETRY':
      return state.phase === 'bootstrap_failed' ? { ...state, phase: 'bootstrapping', error: null } : state;

    case 'BOOTSTRAP_SUCCEEDED':
      if (state.phase !== 'bootstrapping' || action.epoch !== state.epoch) return state;
      return action.draft === null
        ? { ...state, phase: 'empty', draft: null, error: null, notice: null }
        : enterReview(state, action.draft, true);

    case 'BOOTSTRAP_FAILED':
      if (state.phase !== 'bootstrapping' || action.epoch !== state.epoch) return state;
      return { ...state, phase: 'bootstrap_failed', error: { scope: 'bootstrap', cause: action.error } };

    case 'FILE_SELECTED': {
      const decision = decideUpload(state, action.file);
      switch (decision.kind) {
        case 'ignored':
          return state;
        case 'precheck_failed':
          return { ...state, error: { scope: 'upload', cause: { kind: 'local', message: decision.message } } };
        case 'needs_overwrite':
          return { ...state, pendingFile: action.file, dialog: 'overwrite', error: null };
        case 'start':
          return { ...state, busy: 'upload', pendingFile: action.file, error: null };
      }
      return state;
    }

    case 'OVERWRITE_CONFIRMED':
      if (state.dialog !== 'overwrite' || state.pendingFile === null || state.busy !== null) return state;
      return { ...state, dialog: null, busy: 'upload' };

    case 'OVERWRITE_CANCELLED':
      return state.dialog === 'overwrite' ? { ...state, dialog: null, pendingFile: null } : state;

    case 'UPLOAD_SUCCEEDED':
      if (isStale(state, action.epoch, 'upload')) return state;
      return enterReview(state, action.draft, false);

    case 'UPLOAD_FAILED':
      if (isStale(state, action.epoch, 'upload')) return state;
      return { ...state, busy: null, pendingFile: null, error: { scope: 'upload', cause: action.error } };

    case 'FIELD_EDITED': {
      if (state.phase !== 'reviewing' || state.busy !== null) return state;
      return {
        ...state,
        editBuffer: { ...state.editBuffer, ...action.update },
        fieldErrors: clearErrorsForFields(state.fieldErrors, Object.keys(action.update)),
      };
    }

    case 'SECTION_SELECTED':
      return state.phase === 'reviewing' ? { ...state, activeSection: action.section } : state;

    case 'SECTION_CONFIRM_REQUESTED': {
      if (state.phase !== 'reviewing' || state.view !== 'sections' || state.busy !== null || state.dialog !== null) {
        return state;
      }
      if (state.draft === null) return state;
      const { errors } = buildSectionUpdate(getSection(action.section), state.draft.fields, state.editBuffer);
      const sectionKeys: string[] = getSection(action.section).fields.map((f) => f.key);
      if (Object.keys(errors).length > 0) {
        return { ...state, fieldErrors: { ...clearErrorsForFields(state.fieldErrors, sectionKeys), ...errors } };
      }
      return { ...state, busy: 'patch', error: null, fieldErrors: clearErrorsForFields(state.fieldErrors, sectionKeys) };
    }

    case 'PATCH_SUCCEEDED': {
      if (isStale(state, action.epoch, 'patch')) return state;
      const sectionKeys = getSection(action.section).fields.map((f) => f.key as ResumeFieldKey);
      const editBuffer: Record<string, unknown> = { ...state.editBuffer };
      for (const key of sectionKeys) delete editBuffer[key];
      const next = nextUnconfirmedSection(action.draft, action.section);
      return {
        ...state,
        busy: null,
        draft: action.draft,
        editBuffer: editBuffer as ResumeFieldsUpdate,
        fieldErrors: clearErrorsForFields(state.fieldErrors, sectionKeys),
        error: null,
        restored: false,
        view: next === null ? 'final' : 'sections',
        activeSection: next ?? state.activeSection,
      };
    }

    case 'PATCH_FAILED': {
      if (isStale(state, action.epoch, 'patch')) return state;
      if (action.error.code === 'draft_not_found') {
        return { ...resetToEmpty(state, false), epoch: state.epoch, notice: 'draft_expired' };
      }
      return {
        ...state,
        busy: null,
        fieldErrors:
          action.error.code === 'validation_failed'
            ? { ...state.fieldErrors, ...fieldErrorsFromDetails(action.error) }
            : state.fieldErrors,
        error: { scope: 'section', cause: action.error },
      };
    }

    case 'GO_FINAL_REQUESTED': {
      if (state.phase !== 'reviewing' || state.busy !== null || state.dialog !== null) return state;
      if (state.view === 'final') return state;
      if (hasUnsubmittedEdits(state.editBuffer)) return { ...state, dialog: 'unsubmitted_edits' };
      return { ...state, view: 'final', error: null };
    }

    case 'DISCARD_EDITS_AND_GO_FINAL':
      if (state.dialog !== 'unsubmitted_edits') return state;
      return { ...state, dialog: null, editBuffer: {}, fieldErrors: {}, view: 'final', error: null };

    case 'BACK_TO_SECTIONS': {
      if (state.phase !== 'reviewing' || state.busy !== null) return state;
      const todo = state.draft ? firstTodoSection(state.draft.fields) : null;
      return { ...state, view: 'sections', activeSection: todo ?? 'basic', error: null };
    }

    case 'CONFIRM_REQUESTED': {
      if (state.phase !== 'reviewing' || state.view !== 'final' || state.busy !== null || state.dialog !== null) {
        return state;
      }
      if (state.draft === null || !coreReady(state.draft.fields, state.editBuffer)) return state;
      if (hasUnsubmittedEdits(state.editBuffer)) return { ...state, dialog: 'unsubmitted_edits' };
      if (unconfirmedCount(state.draft.fields) > 0) return { ...state, dialog: 'unconfirmed' };
      return { ...state, busy: 'confirm', error: null };
    }

    case 'CONFIRM_PROCEEDED':
      if (state.dialog !== 'unconfirmed' || state.busy !== null || state.draft === null) return state;
      return { ...state, dialog: null, busy: 'confirm', error: null };

    case 'CONFIRM_SUCCEEDED': {
      if (isStale(state, action.epoch, 'confirm') || state.draft === null) return state;
      const { response } = action;
      const base: SessionState = {
        ...state,
        phase: 'saved',
        view: 'sections',
        busy: null,
        draft: null,
        restored: false,
        editBuffer: {},
        fieldErrors: {},
        error: null,
        pendingFile: null,
        dialog: null,
      };
      if (response.already_saved) {
        return { ...base, notice: 'already_saved', savedSummary: null };
      }
      return {
        ...base,
        notice: null,
        savedSummary: {
          name: state.draft.fields.name.value ?? '',
          filename: state.draft.original_file.filename,
          saved_at: response.saved_at,
        },
      };
    }

    case 'CONFIRM_FAILED': {
      if (isStale(state, action.epoch, 'confirm')) return state;
      if (action.error.code === 'draft_not_found') {
        return { ...resetToEmpty(state, false), epoch: state.epoch, notice: 'maybe_saved' };
      }
      if (action.error.code === 'validation_failed') {
        const fieldErrors = fieldErrorsFromDetails(action.error);
        const firstPath = action.error.details?.[0]?.field;
        const section = firstPath ? sectionOfPath(firstPath) : null;
        return {
          ...state,
          busy: null,
          view: 'sections',
          activeSection: section ?? state.activeSection,
          fieldErrors,
          error: { scope: 'section', cause: action.error },
        };
      }
      return { ...state, busy: null, error: { scope: 'confirm', cause: action.error } };
    }

    case 'DIALOG_DISMISSED':
      return state.dialog === null
        ? state
        : { ...state, dialog: null, pendingFile: state.dialog === 'overwrite' ? null : state.pendingFile };

    case 'NEW_CHAT_REQUESTED': {
      if (state.busy !== null || state.dialog !== null) return state;
      if (state.phase === 'empty' || state.phase === 'saved') return resetToEmpty(state, false);
      if (state.phase === 'reviewing') return { ...state, dialog: 'new_chat' };
      return state;
    }

    case 'NEW_CHAT_CONFIRMED':
      return state.dialog === 'new_chat' && state.busy === null ? resetToEmpty(state, true) : state;

    case 'UPLOAD_NEXT':
      return state.phase === 'saved' ? resetToEmpty(state, false) : state;

    case 'NOTICE_DISMISSED':
      return { ...state, notice: null };
  }
}
