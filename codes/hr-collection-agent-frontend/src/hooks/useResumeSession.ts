import { useCallback, useEffect, useReducer, useState } from 'react';
import { ApiError } from '../api/ApiError';
import { createSession, getSession, updateSessionFields } from '../api/SessionApi';
import type { ResumeFieldsUpdate } from '../types/ResumeModel';
import { getSection, type SectionKey } from './model/SectionConfig';
import { buildSectionUpdate } from './model/SectionView';
import { initialState, sessionReducer, type SessionAction, type SessionState } from './model/SessionReducer';
import { MULTIPLE_FILES_NOTICE, pickSingleFile } from './model/UploadPrecheck';

/** Anything thrown by the api layer is already an ApiError; guard anyway so the UI never sees raw errors. */
function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : ApiError.unknown();
}

export interface ResumeSessionOptions {
  /** Called after a successful action that changes the server-side session list (the list reloads, TD-30). */
  onActivity?: () => void;
}

interface Ref<T> {
  current: T;
}

/**
 * The side-effect engine of the session state machine.
 * The reducer's "request" actions only set `busy`; `send` applies an action and, when it started a request
 * (busy or read purpose changed), launches the matching api call. Results are dispatched back together with the epoch
 * captured at launch, so a late answer of a previous view is dropped by the reducer (TD-04).
 */
function createEngine(dispatch: (action: SessionAction) => void) {
  const latest: Ref<SessionState> = { current: initialState() };
  const onActivity: Ref<(() => void) | undefined> = { current: undefined };
  /** Session id for the read that `openSession` started (the reducer does not store it). */
  let openId: string | null = null;
  /** Section whose PATCH is being started. */
  let patchSection: SectionKey | null = null;

  function send(action: SessionAction) {
    const before = latest.current;
    const after = sessionReducer(before, action);
    latest.current = after;
    dispatch(action);
    if (after.busy !== null && (after.busy !== before.busy || after.readPurpose !== before.readPurpose)) {
      launch(before, after);
    }
    if (after.notice === 'session_gone' && before.notice !== 'session_gone') onActivity.current?.();
    return { before, after };
  }

  /** Sends a result action; the activity callback fires only when the reducer accepted it (not stale). */
  function settle(action: SessionAction, activity = true) {
    const { before, after } = send(action);
    if (activity && after !== before) onActivity.current?.();
  }

  function launch(before: SessionState, after: SessionState) {
    const epoch = after.epoch;
    switch (after.busy) {
      case 'read':
        launchRead(before, after);
        break;
      case 'upload': {
        if (after.pendingFile === null) break;
        void createSession(after.pendingFile).then(
          (detail) => settle({ type: 'UPLOAD_SUCCEEDED', detail, epoch }),
          (error: unknown) => settle({ type: 'UPLOAD_FAILED', error: toApiError(error), epoch }, false),
        );
        break;
      }
      case 'patch': {
        const section = patchSection;
        if (section === null || after.draft === null || after.sessionId === null) break;
        const { update } = buildSectionUpdate(getSection(section), after.draft.fields, after.editBuffer);
        void updateSessionFields(after.sessionId, update).then(
          (response) => settle({ type: 'PATCH_SUCCEEDED', response, section, epoch }),
          (error: unknown) => settle({ type: 'PATCH_FAILED', error: toApiError(error), epoch }, false),
        );
        break;
      }
      default:
        break;
    }
  }

  function launchRead(before: SessionState, after: SessionState) {
    const epoch = after.epoch;
    const fail = (error: unknown) => send({ type: 'READ_FAILED', error: toApiError(error), epoch });
    switch (after.readPurpose) {
      case 'open': {
        const target = before.dialogTarget;
        const id = target?.kind === 'switch' ? target.id : openId;
        if (id === null) break;
        void getSession(id).then((detail) => send({ type: 'READ_SUCCEEDED', detail, epoch }), fail);
        break;
      }
      case 'sync':
        if (after.sessionId === null) break;
        void getSession(after.sessionId).then((detail) => send({ type: 'SESSION_SYNCED', detail, epoch }), fail);
        break;
      default:
        break;
    }
  }

  return {
    send,
    settle,
    sync(state: SessionState, activity: (() => void) | undefined) {
      latest.current = state;
      onActivity.current = activity;
    },
    actions: {
      /** Opens a session from the list: loads it and splits `reviewing` / `saved` (design 5.3 A). */
      openSession(id: string) {
        openId = id;
        send({ type: 'OPEN_REQUESTED', id });
      },
      /** "Continue" in the leave dialog: carries out the intent that raised it. */
      confirmLeave() {
        send({ type: 'LEAVE_CONFIRMED' });
      },
      /** A validated file selection starts a new session (never overwrites another one). */
      selectFile(file: File) {
        send({ type: 'FILE_SELECTED', file });
      },
      selectSection(section: SectionKey) {
        send({ type: 'SECTION_SELECTED', section });
      },
      editField(update: ResumeFieldsUpdate) {
        send({ type: 'FIELD_EDITED', update });
      },
      /** Confirms one section: validates locally (in the reducer) and then sends one PATCH with the whole section. */
      confirmSection(section: SectionKey) {
        patchSection = section;
        send({ type: 'SECTION_CONFIRM_REQUESTED', section });
      },
      goFinal() {
        send({ type: 'GO_FINAL_REQUESTED' });
      },
      discardEditsAndGoFinal() {
        send({ type: 'DISCARD_EDITS_AND_GO_FINAL' });
      },
      /** Leaves the final review; optionally opens a given section (e.g. the core section). */
      backToSections(section?: SectionKey) {
        send({ type: 'BACK_TO_SECTIONS' });
        if (section) send({ type: 'SECTION_SELECTED', section });
      },
      /** Final confirmation entry points; the request itself is launched by task 2.6. */
      confirmResume() {
        send({ type: 'CONFIRM_REQUESTED' });
      },
      proceedUnconfirmed() {
        send({ type: 'CONFIRM_PROCEEDED' });
      },
      /** "＋ 新对话" / "上传下一份": clears the view only; no session is deleted (TD-12). */
      requestNewChat() {
        send({ type: 'NEW_CHAT_REQUESTED' });
      },
      dismissDialog() {
        send({ type: 'DIALOG_DISMISSED' });
      },
      dismissNotice() {
        send({ type: 'NOTICE_DISMISSED' });
      },
    },
  };
}

/** Owns the session state machine and performs its side effects. Page start sends no request (design 5.1). */
export function useResumeSession({ onActivity }: ResumeSessionOptions = {}) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialState);
  const [engine] = useState(() => createEngine(dispatch));
  // The engine mirrors the rendered state and the latest activity callback for its asynchronous results.
  useEffect(() => {
    engine.sync(state, onActivity);
  });
  // Small hint under the composer, e.g. when several files were dropped at once.
  const [selectionNotice, setSelectionNotice] = useState<string | undefined>(undefined);
  const { selectFile } = engine.actions;
  /** A file selection from the picker or a drop. Only one file is used; the rest are ignored with a notice. */
  const requestUpload = useCallback(
    (files: File[]) => {
      const { file, multiple } = pickSingleFile(files);
      if (!file) return;
      setSelectionNotice(multiple ? MULTIPLE_FILES_NOTICE : undefined);
      selectFile(file);
    },
    [selectFile],
  );
  return { state, ...engine.actions, requestUpload, selectionNotice };
}

export type ResumeSession = ReturnType<typeof useResumeSession>;
