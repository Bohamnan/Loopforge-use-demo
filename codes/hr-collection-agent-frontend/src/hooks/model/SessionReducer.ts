import type { ApiError } from '../../api/ApiError';
import type { ChatMessage, SendMessageResponse, SuggestionActionResponse } from '../../types/Conversation';
import type { ErrorReason } from '../../types/Errors';
import type { CreateResumeResponse, UpdateResumeResponse } from '../../types/Resume';
import type { ArchivedResume } from '../../types/Archive';
import type { ResumeFieldKey, ResumeFields, ResumeFieldsUpdate } from '../../types/ResumeModel';
import type { OriginalFileInfo, SessionDetail, SessionFieldsResponse, SessionStatus, UpdateCandidate, UpdateState } from '../../types/Session';
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
import { buildUpdateDiff, type UpdateDiff } from './UpdateDiff';
import { precheckFile } from './UploadPrecheck';
import { cardStatus, decideAfterConfirmRead, decideAfterUpdateRead } from './Verify';

// The whole session state machine as one pure reducer (design §5.2 / §5.3, v2). No side effects, no DOM.
// Requests are performed by useResumeSession, which dispatches the *_SUCCEEDED / *_FAILED results with the
// epoch it captured when the request started; results with another epoch or an unexpected busy state are dropped.
// The epoch is bumped whenever the visible session changes (enter a session, new chat, delete current, session gone),
// so a late response of the previous view can never overwrite the new one (TD-04).

export type Phase = 'empty' | 'reviewing' | 'saved';
export type View = 'sections' | 'final';
export type Busy = null | 'upload' | 'read' | 'patch' | 'chat' | 'suggest' | 'confirm' | 'update' | 'delete';
/** Why a read is running: open a session, or re-read after an unknown result / a read-only conflict (TD-17, TD-19). */
export type ReadPurpose = 'open' | 'sync' | 'verify_message' | 'verify_confirm' | 'verify_update';
export type NoticeKind = 'already_saved' | 'updated' | 'session_gone';
export type ErrorScope = 'upload' | 'read' | 'section' | 'chat' | 'suggest' | 'confirm' | 'update' | 'delete';
export type DialogKind = null | 'leave' | 'delete' | 'unconfirmed' | 'unsubmitted_edits';

/** What the user wanted to do when the "unsubmitted edits will be lost" dialog appeared (TD-29). */
export type LeaveIntent = { kind: 'switch'; id: string } | { kind: 'new_chat' } | { kind: 'upload'; file: File };
export type DialogTarget = LeaveIntent | { kind: 'delete'; id: string; status: SessionStatus };

/** A failure detected in the browser before any request (e.g. upload precheck). */
export interface LocalError {
  kind: 'local';
  message: string;
}

export interface SessionError {
  scope: ErrorScope;
  cause: ApiError | LocalError;
  /** Suggestion card the error belongs to. */
  messageId?: string;
}

/** The only resume summary kept for the "just saved" card (design TD-11). */
export interface SavedSummary {
  name: string;
  filename: string;
  saved_at: string;
}

export interface Draft {
  original_file: OriginalFileInfo;
  fields: ResumeFields;
}

export interface SavedView {
  resume: ArchivedResume;
  update_state: UpdateState;
  update_candidate: UpdateCandidate | null;
}

export type PendingStage = 'sending' | 'failed' | 'unknown';
export interface PendingMessage {
  text: string;
  /** Message ids known before sending; tells an earlier identical text apart when verifying (TD-19). */
  knownIds: string[];
  stage: PendingStage;
}

export interface SessionState {
  phase: Phase;
  view: View;
  busy: Busy;
  readPurpose: ReadPurpose | null;
  /** Bumped when the visible session changes; async results carrying another epoch are discarded. */
  epoch: number;
  sessionId: string | null;
  draft: Draft | null;
  saved: SavedView | null;
  messages: ChatMessage[];
  activeSection: SectionKey;
  /** Unsubmitted edits, in memory only (F-02). */
  editBuffer: ResumeFieldsUpdate;
  /** Field-path -> reason, from local validation or backend 422 details. */
  fieldErrors: Record<string, ErrorReason>;
  pendingMessage: PendingMessage | null;
  diff: UpdateDiff | null;
  notice: NoticeKind | null;
  error: SessionError | null;
  pendingFile: File | null;
  savedSummary: SavedSummary | null;
  dialog: DialogKind;
  dialogTarget: DialogTarget | null;
}

export type SessionAction =
  // A. read / switch
  | { type: 'OPEN_REQUESTED'; id: string }
  | { type: 'LEAVE_CONFIRMED' }
  | { type: 'READ_SUCCEEDED'; detail: SessionDetail; epoch: number }
  | { type: 'READ_FAILED'; error: ApiError; epoch: number }
  | { type: 'SESSION_SYNCED'; detail: SessionDetail; epoch: number }
  // B. upload
  | { type: 'FILE_SELECTED'; file: File }
  | { type: 'UPLOAD_SUCCEEDED'; detail: SessionDetail; epoch: number }
  | { type: 'UPLOAD_FAILED'; error: ApiError; epoch: number }
  // C. section editing
  | { type: 'FIELD_EDITED'; update: ResumeFieldsUpdate }
  | { type: 'SECTION_SELECTED'; section: SectionKey }
  | { type: 'SECTION_CONFIRM_REQUESTED'; section: SectionKey }
  | { type: 'PATCH_SUCCEEDED'; response: SessionFieldsResponse; section: SectionKey; epoch: number }
  | { type: 'PATCH_FAILED'; error: ApiError; epoch: number }
  | { type: 'GO_FINAL_REQUESTED' }
  | { type: 'DISCARD_EDITS_AND_GO_FINAL' }
  | { type: 'BACK_TO_SECTIONS' }
  // D. chat and suggestions
  | { type: 'SEND_REQUESTED'; text: string }
  | { type: 'SEND_SUCCEEDED'; response: SendMessageResponse; epoch: number }
  | { type: 'SEND_FAILED'; error: ApiError; epoch: number }
  | { type: 'MESSAGE_RETRY_REQUESTED' }
  | { type: 'MESSAGE_RESEND'; epoch: number }
  | { type: 'MESSAGE_VERIFIED'; detail: SessionDetail; epoch: number }
  | { type: 'MESSAGE_DISCARDED' }
  | { type: 'SUGGEST_REQUESTED'; messageId: string }
  | { type: 'SUGGEST_SUCCEEDED'; response: SuggestionActionResponse; epoch: number }
  | { type: 'SUGGEST_FAILED'; error: ApiError; messageId: string; epoch: number }
  // E. final confirmation and save
  | { type: 'CONFIRM_REQUESTED' }
  | { type: 'CONFIRM_PROCEEDED' }
  | { type: 'CONFIRM_SUCCEEDED'; response: CreateResumeResponse; detail: SessionDetail | null; readError: ApiError | null; epoch: number }
  | { type: 'CONFIRM_FAILED'; error: ApiError; epoch: number }
  | { type: 'CONFIRM_VERIFIED'; detail: SessionDetail; epoch: number }
  // F. confirmed update
  | { type: 'DIFF_OPENED' }
  | { type: 'DIFF_CLOSED' }
  | { type: 'UPDATE_REQUESTED' }
  | { type: 'UPDATE_SUCCEEDED'; response: UpdateResumeResponse; detail: SessionDetail | null; readError: ApiError | null; epoch: number }
  | { type: 'UPDATE_FAILED'; error: ApiError; epoch: number }
  | { type: 'UPDATE_VERIFY_REQUESTED' }
  | { type: 'UPDATE_VERIFIED'; detail: SessionDetail; epoch: number }
  | { type: 'REREAD_REQUESTED' }
  // G. delete / new chat / misc
  | { type: 'DELETE_REQUESTED'; id: string; status: SessionStatus }
  | { type: 'DELETE_CONFIRMED' }
  | { type: 'DELETE_SUCCEEDED'; id: string; epoch: number }
  | { type: 'DELETE_FAILED'; error: ApiError; epoch: number }
  | { type: 'NEW_CHAT_REQUESTED' }
  | { type: 'DIALOG_DISMISSED' }
  | { type: 'NOTICE_DISMISSED' };

export function initialState(): SessionState {
  return {
    phase: 'empty',
    view: 'sections',
    busy: null,
    readPurpose: null,
    epoch: 0,
    sessionId: null,
    draft: null,
    saved: null,
    messages: [],
    activeSection: 'basic',
    editBuffer: {},
    fieldErrors: {},
    pendingMessage: null,
    diff: null,
    notice: null,
    error: null,
    pendingFile: null,
    savedSummary: null,
    dialog: null,
    dialogTarget: null,
  };
}

/** Back to the empty view. Sessions on the server are untouched (TD-12). */
function resetToEmpty(state: SessionState, notice: NoticeKind | null = null): SessionState {
  return { ...initialState(), epoch: state.epoch + 1, notice };
}

/** The session does not exist (any more) on the server (REQ-FE-04.7). */
function gone(state: SessionState): SessionState {
  return resetToEmpty(state, 'session_gone');
}

const isGone = (error: ApiError) => error.code === 'session_not_found';

/** The single entry that loads a server session into the view. `reviewing` and `saved` are split here (TD-18). */
function enterSession(state: SessionState, detail: SessionDetail, options: { keepError?: boolean } = {}): SessionState {
  const base: SessionState = {
    ...state,
    epoch: state.epoch + 1,
    busy: null,
    readPurpose: null,
    sessionId: detail.session_id,
    messages: detail.messages,
    editBuffer: {},
    fieldErrors: {},
    pendingMessage: null,
    diff: null,
    error: options.keepError ? state.error : null,
    pendingFile: null,
    savedSummary: null,
    dialog: null,
    dialogTarget: null,
  };
  if (detail.status === 'reviewing' && detail.fields) {
    const todo = firstTodoSection(detail.fields);
    return {
      ...base,
      phase: 'reviewing',
      view: todo === null ? 'final' : 'sections',
      draft: { original_file: detail.original_file, fields: detail.fields },
      saved: null,
      activeSection: todo ?? 'basic',
      notice: null,
    };
  }
  return {
    ...base,
    phase: 'saved',
    view: 'sections',
    draft: null,
    saved: savedViewOf(detail),
    notice: detail.update_state === 'pending' ? 'already_saved' : null,
  };
}

function savedViewOf(detail: SessionDetail): SavedView | null {
  return detail.status === 'saved' && detail.resume
    ? { resume: detail.resume, update_state: detail.update_state, update_candidate: detail.update_candidate }
    : null;
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

function isStale(state: SessionState, epoch: number, busy: Busy, purpose?: ReadPurpose): boolean {
  return epoch !== state.epoch || state.busy !== busy || (purpose !== undefined && state.readPurpose !== purpose);
}

/** The first section that is not fully confirmed, searching after `from` and then wrapping around. */
function nextUnconfirmedSection(fields: ResumeFields, from: SectionKey): SectionKey | null {
  const start = SECTIONS.findIndex((s) => s.key === from);
  const ordered = [...SECTIONS.slice(start + 1), ...SECTIONS.slice(0, start + 1)];
  return ordered.find((s) => sectionStatus(s, fields) !== 'confirmed')?.key ?? null;
}

function clearErrorsForFields(errors: Record<string, ErrorReason>, keys: readonly string[]): Record<string, ErrorReason> {
  const result: Record<string, ErrorReason> = {};
  for (const [path, reason] of Object.entries(errors)) {
    if (!keys.includes(parseFieldPath(path)?.field ?? path)) {
      result[path] = reason;
    }
  }
  return result;
}

/** Errors after which the outcome of the request is unknown (the request may or may not have taken effect). */
export function isUnknownOutcome(error: ApiError): boolean {
  return error.code === 'client_timeout' || error.code === 'network_error' || error.code === 'unknown_error';
}

export type UploadDecision =
  | { kind: 'ignored' }
  | { kind: 'precheck_failed'; message: string }
  | { kind: 'needs_leave' }
  | { kind: 'start' };

/** Shared by the reducer and the hook so both agree on what a file selection does (upload always creates a new session). */
export function decideUpload(state: SessionState, file: File): UploadDecision {
  if (state.busy !== null || state.dialog !== null) return { kind: 'ignored' };
  const check = precheckFile(file);
  if (!check.ok) return { kind: 'precheck_failed', message: check.message };
  if (hasUnsubmittedEdits(state.editBuffer)) return { kind: 'needs_leave' };
  return { kind: 'start' };
}

function startRead(state: SessionState, purpose: ReadPurpose, error: SessionError | null = null): SessionState {
  return { ...state, busy: 'read', readPurpose: purpose, error };
}

/** Where a failed read puts its error. */
const READ_ERROR_SCOPE: Record<ReadPurpose, ErrorScope> = {
  open: 'read',
  sync: 'read',
  verify_message: 'chat',
  verify_confirm: 'confirm',
  verify_update: 'update',
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    // ---------- A. read / switch ----------
    case 'OPEN_REQUESTED': {
      if (state.busy !== null || state.dialog !== null) return state;
      if (hasUnsubmittedEdits(state.editBuffer)) {
        return { ...state, dialog: 'leave', dialogTarget: { kind: 'switch', id: action.id } };
      }
      return startRead({ ...state, pendingFile: null }, 'open');
    }

    case 'LEAVE_CONFIRMED': {
      const target = state.dialogTarget;
      if (state.dialog !== 'leave' || state.busy !== null || target === null || target.kind === 'delete') return state;
      const closed = { ...state, dialog: null, dialogTarget: null } as SessionState;
      if (target.kind === 'new_chat') return resetToEmpty(closed);
      if (target.kind === 'upload') return { ...closed, busy: 'upload', pendingFile: target.file, error: null };
      return startRead(closed, 'open');
    }

    case 'READ_SUCCEEDED':
      if (isStale(state, action.epoch, 'read', 'open')) return state;
      return enterSession(state, action.detail);

    case 'READ_FAILED': {
      if (state.busy !== 'read' || state.readPurpose === null || action.epoch !== state.epoch) return state;
      if (isGone(action.error)) return gone(state);
      return {
        ...state,
        busy: null,
        error: { scope: READ_ERROR_SCOPE[state.readPurpose], cause: action.error },
        readPurpose: null,
      };
    }

    case 'SESSION_SYNCED': {
      // Refresh after a conflict or a lost reload: the server is the authority, unsubmitted edits stay (reviewing).
      if (isStale(state, action.epoch, 'read', 'sync')) return state;
      const { detail } = action;
      if (detail.status === 'reviewing' && detail.fields && state.phase === 'reviewing' && state.draft) {
        return {
          ...state,
          busy: null,
          readPurpose: null,
          draft: { ...state.draft, fields: detail.fields },
          messages: detail.messages,
          view: state.view,
        };
      }
      if (detail.status === 'saved' && state.phase === 'saved') {
        // Re-read of an already saved view (e.g. after a failed reload): keep notice and the just-saved card.
        return { ...state, busy: null, readPurpose: null, saved: savedViewOf(detail), messages: detail.messages, error: null };
      }
      return enterSession(state, detail, { keepError: true });
    }

    // ---------- B. upload ----------
    case 'FILE_SELECTED': {
      const decision = decideUpload(state, action.file);
      switch (decision.kind) {
        case 'ignored':
          return state;
        case 'precheck_failed':
          return { ...state, error: { scope: 'upload', cause: { kind: 'local', message: decision.message } } };
        case 'needs_leave':
          return { ...state, dialog: 'leave', dialogTarget: { kind: 'upload', file: action.file }, error: null };
        case 'start':
          return { ...state, busy: 'upload', pendingFile: action.file, error: null };
      }
      return state;
    }

    case 'UPLOAD_SUCCEEDED':
      if (isStale(state, action.epoch, 'upload')) return state;
      return enterSession(state, action.detail);

    case 'UPLOAD_FAILED':
      // The current view stays as it was (O-02); only the error is added.
      if (isStale(state, action.epoch, 'upload')) return state;
      return { ...state, busy: null, pendingFile: null, error: { scope: 'upload', cause: action.error } };

    // ---------- C. section editing ----------
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
      if (isStale(state, action.epoch, 'patch') || state.draft === null) return state;
      const sectionKeys = getSection(action.section).fields.map((f) => f.key as ResumeFieldKey);
      const editBuffer: Record<string, unknown> = { ...state.editBuffer };
      for (const key of sectionKeys) delete editBuffer[key];
      const fields = action.response.fields;
      const next = nextUnconfirmedSection(fields, action.section);
      return {
        ...state,
        busy: null,
        draft: { ...state.draft, fields },
        editBuffer: editBuffer as ResumeFieldsUpdate,
        fieldErrors: clearErrorsForFields(state.fieldErrors, sectionKeys),
        error: null,
        view: next === null ? 'final' : 'sections',
        activeSection: next ?? state.activeSection,
      };
    }

    case 'PATCH_FAILED': {
      if (isStale(state, action.epoch, 'patch')) return state;
      if (isGone(action.error)) return gone(state);
      const error: SessionError = { scope: 'section', cause: action.error };
      if (action.error.code === 'session_read_only') return startRead({ ...state, busy: null }, 'sync', error);
      return {
        ...state,
        busy: null,
        fieldErrors:
          action.error.code === 'validation_failed'
            ? { ...state.fieldErrors, ...fieldErrorsFromDetails(action.error) }
            : state.fieldErrors,
        error,
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

    // ---------- D. chat and suggestions ----------
    case 'SEND_REQUESTED': {
      const text = action.text.trim();
      if (state.phase !== 'reviewing' || state.busy !== null || state.dialog !== null || state.pendingMessage !== null) return state;
      if (text === '' || action.text.length > 2000) return state;
      return {
        ...state,
        busy: 'chat',
        error: null,
        pendingMessage: { text: action.text, knownIds: state.messages.map((m) => m.message_id), stage: 'sending' },
      };
    }

    case 'SEND_SUCCEEDED': {
      if (isStale(state, action.epoch, 'chat') || state.pendingMessage === null) return state;
      return {
        ...state,
        busy: null,
        pendingMessage: null,
        messages: [...state.messages, action.response.user_message, action.response.assistant_message],
      };
    }

    case 'SEND_FAILED': {
      if (isStale(state, action.epoch, 'chat') || state.pendingMessage === null) return state;
      if (isGone(action.error)) return gone(state);
      const error: SessionError = { scope: 'chat', cause: action.error };
      if (action.error.code === 'session_read_only') {
        return startRead({ ...state, busy: null, pendingMessage: null }, 'sync', error);
      }
      const stage: PendingStage = isUnknownOutcome(action.error) ? 'unknown' : 'failed';
      return { ...state, busy: null, pendingMessage: { ...state.pendingMessage, stage }, error };
    }

    case 'MESSAGE_RETRY_REQUESTED': {
      const pending = state.pendingMessage;
      if (state.busy !== null || pending === null || state.phase !== 'reviewing') return state;
      if (pending.stage === 'failed') return { ...state, busy: 'chat', error: null, pendingMessage: { ...pending, stage: 'sending' } };
      if (pending.stage === 'unknown') return startRead(state, 'verify_message');
      return state;
    }

    case 'MESSAGE_RESEND':
      // The verifying read found nothing: the lost request never reached the server, so send again.
      if (isStale(state, action.epoch, 'read', 'verify_message') || state.pendingMessage === null) return state;
      return {
        ...state,
        busy: 'chat',
        readPurpose: null,
        error: null,
        pendingMessage: { ...state.pendingMessage, stage: 'sending' },
      };

    case 'MESSAGE_VERIFIED':
      if (isStale(state, action.epoch, 'read', 'verify_message')) return state;
      return { ...state, busy: null, readPurpose: null, pendingMessage: null, error: null, messages: action.detail.messages };

    case 'MESSAGE_DISCARDED':
      return state.busy === null && state.pendingMessage !== null
        ? { ...state, pendingMessage: null, error: state.error?.scope === 'chat' ? null : state.error }
        : state;

    case 'SUGGEST_REQUESTED': {
      if (state.phase !== 'reviewing' || state.busy !== null || state.dialog !== null) return state;
      const message = state.messages.find((m) => m.message_id === action.messageId);
      if (!message || cardStatus(message.suggestions) !== 'pending') return state;
      return { ...state, busy: 'suggest', error: null };
    }

    case 'SUGGEST_SUCCEEDED': {
      if (isStale(state, action.epoch, 'suggest') || state.draft === null) return state;
      const { response } = action;
      const before = state.messages.find((m) => m.message_id === response.message_id);
      const newlyApplied = response.suggestions.filter(
        (s) => s.status === 'applied' && before?.suggestions.find((b) => b.suggestion_id === s.suggestion_id)?.status !== 'applied',
      );
      // What was applied is authoritative: unsubmitted edits of those fields are dropped (TD-03).
      const editBuffer: Record<string, unknown> = { ...state.editBuffer };
      for (const s of newlyApplied) delete editBuffer[s.field];
      return {
        ...state,
        busy: null,
        error: null,
        draft: { ...state.draft, fields: response.fields },
        editBuffer: editBuffer as ResumeFieldsUpdate,
        fieldErrors: clearErrorsForFields(state.fieldErrors, newlyApplied.map((s) => s.field)),
        messages: state.messages.map((m) => (m.message_id === response.message_id ? { ...m, suggestions: response.suggestions } : m)),
      };
    }

    case 'SUGGEST_FAILED': {
      if (isStale(state, action.epoch, 'suggest')) return state;
      if (isGone(action.error)) return gone(state);
      const error: SessionError = { scope: 'suggest', cause: action.error, messageId: action.messageId };
      // Already handled elsewhere / conflict: read the session again so the card shows the truth.
      if (action.error.code === 'suggestion_unavailable' || action.error.code === 'session_read_only') {
        return startRead({ ...state, busy: null }, 'sync', error);
      }
      return { ...state, busy: null, error };
    }

    // ---------- E. final confirmation and save ----------
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
      // "Saved" appears only here (a well-formed 2xx answer) or in CONFIRM_VERIFIED (re-read says status=saved) - F-03.
      if (isStale(state, action.epoch, 'confirm') || state.draft === null) return state;
      const { response, detail } = action;
      const savedView = detail ? savedViewOf(detail) : null;
      return {
        ...state,
        phase: 'saved',
        view: 'sections',
        busy: null,
        draft: null,
        saved: savedView,
        messages: detail && savedView ? detail.messages : state.messages,
        editBuffer: {},
        fieldErrors: {},
        pendingMessage: null,
        diff: null,
        error: action.readError ? { scope: 'read', cause: action.readError } : null,
        pendingFile: null,
        dialog: null,
        dialogTarget: null,
        notice: response.already_saved ? 'already_saved' : null,
        savedSummary: response.already_saved
          ? null
          : { name: state.draft.fields.name.value ?? '', filename: state.draft.original_file.filename, saved_at: response.saved_at },
      };
    }

    case 'CONFIRM_FAILED': {
      if (isStale(state, action.epoch, 'confirm')) return state;
      if (isGone(action.error)) return gone(state);
      if (action.error.code === 'validation_failed') {
        const firstPath = action.error.details?.[0]?.field;
        const section = firstPath ? sectionOfPath(firstPath) : null;
        return {
          ...state,
          busy: null,
          view: 'sections',
          activeSection: section ?? state.activeSection,
          fieldErrors: fieldErrorsFromDetails(action.error),
          error: { scope: 'section', cause: action.error },
        };
      }
      const error: SessionError = { scope: 'confirm', cause: action.error };
      // Outcome unknown (or the session is already saved): read it before saying anything.
      if (isUnknownOutcome(action.error) || action.error.code === 'session_read_only') {
        return startRead({ ...state, busy: null }, 'verify_confirm', error);
      }
      return { ...state, busy: null, error };
    }

    case 'CONFIRM_VERIFIED': {
      if (isStale(state, action.epoch, 'read', 'verify_confirm') || state.draft === null) return state;
      const decision = decideAfterConfirmRead(action.detail);
      if (decision.kind === 'still_reviewing') {
        // Not saved as far as the server says: allow a retry; keep the original error (shown as "cannot confirm").
        return { ...state, busy: null, readPurpose: null };
      }
      const resume = action.detail.resume;
      return {
        ...state,
        phase: 'saved',
        view: 'sections',
        busy: null,
        readPurpose: null,
        draft: null,
        saved: savedViewOf(action.detail),
        messages: action.detail.messages,
        editBuffer: {},
        fieldErrors: {},
        pendingMessage: null,
        diff: null,
        error: null,
        dialog: null,
        notice: decision.already ? 'already_saved' : null,
        savedSummary:
          decision.already || !resume
            ? null
            : { name: resume.fields.name ?? '', filename: resume.original_file.filename, saved_at: resume.saved_at },
      };
    }

    // ---------- F. confirmed update ----------
    case 'DIFF_OPENED': {
      const saved = state.saved;
      if (state.phase !== 'saved' || state.busy !== null || saved === null || saved.update_candidate === null) return state;
      return { ...state, diff: buildUpdateDiff(saved.resume, saved.update_candidate), error: null };
    }

    case 'DIFF_CLOSED':
      return state.busy === null && state.diff !== null ? { ...state, diff: null, error: null } : state;

    case 'UPDATE_REQUESTED':
      if (state.phase !== 'saved' || state.busy !== null || state.diff === null) return state;
      return { ...state, busy: 'update', error: null };

    case 'UPDATE_SUCCEEDED': {
      // "Updated" appears only here (PUT 2xx with a valid shape) or in UPDATE_VERIFIED (re-read says applied) - F-03.
      if (isStale(state, action.epoch, 'update')) return state;
      const savedView = action.detail ? savedViewOf(action.detail) : null;
      return {
        ...state,
        busy: null,
        diff: null,
        notice: 'updated',
        saved: savedView ?? state.saved,
        messages: action.detail && savedView ? action.detail.messages : state.messages,
        error: action.readError ? { scope: 'read', cause: action.readError } : null,
      };
    }

    case 'UPDATE_FAILED': {
      if (isStale(state, action.epoch, 'update')) return state;
      if (isGone(action.error)) return gone(state);
      const error: SessionError = { scope: 'update', cause: action.error };
      if (action.error.code === 'update_not_available') return startRead({ ...state, busy: null }, 'verify_update', error);
      // The diff card stays so the user can retry; the existing record is unchanged on save_failed.
      return { ...state, busy: null, error };
    }

    case 'UPDATE_VERIFY_REQUESTED':
      if (state.phase !== 'saved' || state.busy !== null || state.diff === null) return state;
      return startRead(state, 'verify_update', state.error);

    case 'UPDATE_VERIFIED': {
      if (isStale(state, action.epoch, 'read', 'verify_update')) return state;
      const decision = decideAfterUpdateRead(action.detail);
      const savedView = savedViewOf(action.detail);
      const common = { ...state, busy: null as Busy, readPurpose: null };
      if (decision === 'applied') {
        return { ...common, diff: null, notice: 'updated', error: null, saved: savedView ?? state.saved, messages: action.detail.messages };
      }
      // Still pending: the update did not happen (as far as the server says); keep the card, the error stays visible.
      if (decision === 'pending') return { ...common, saved: savedView ?? state.saved };
      return { ...common, diff: null, saved: savedView ?? state.saved, messages: action.detail.messages };
    }

    case 'REREAD_REQUESTED':
      // After a successful save / update whose reload failed: read the session again.
      if (state.phase !== 'saved' || state.busy !== null) return state;
      return startRead(state, 'sync', null);

    // ---------- G. delete / new chat ----------
    case 'DELETE_REQUESTED':
      if (state.busy !== null || state.dialog !== null) return state;
      return { ...state, dialog: 'delete', dialogTarget: { kind: 'delete', id: action.id, status: action.status } };

    case 'DELETE_CONFIRMED':
      if (state.dialog !== 'delete' || state.busy !== null || state.dialogTarget?.kind !== 'delete') return state;
      return { ...state, dialog: null, busy: 'delete', error: null };

    case 'DELETE_SUCCEEDED': {
      if (isStale(state, action.epoch, 'delete')) return state;
      if (action.id === state.sessionId) return resetToEmpty(state);
      return { ...state, busy: null, dialogTarget: null };
    }

    case 'DELETE_FAILED':
      if (isStale(state, action.epoch, 'delete')) return state;
      return { ...state, busy: null, dialogTarget: null, error: { scope: 'delete', cause: action.error } };

    case 'NEW_CHAT_REQUESTED': {
      if (state.busy !== null || state.dialog !== null) return state;
      if (hasUnsubmittedEdits(state.editBuffer)) return { ...state, dialog: 'leave', dialogTarget: { kind: 'new_chat' } };
      return resetToEmpty(state);
    }

    case 'DIALOG_DISMISSED':
      return state.dialog === null ? state : { ...state, dialog: null, dialogTarget: null };

    case 'NOTICE_DISMISSED':
      return { ...state, notice: null };
  }
}
