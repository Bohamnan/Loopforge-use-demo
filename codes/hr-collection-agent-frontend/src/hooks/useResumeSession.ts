import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError } from '../api/ApiError';
import { createResumeDraft, getCurrentResumeDraft } from '../api/ResumeDraftApi';
import type { SectionKey } from './model/SectionConfig';
import { initialState, sessionReducer, type SessionAction, type SessionState } from './model/SessionReducer';
import { MULTIPLE_FILES_NOTICE, pickSingleFile } from './model/UploadPrecheck';

/** Anything thrown by the api layer is already an ApiError; guard anyway so the UI never sees raw errors. */
function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : ApiError.unknown();
}

/**
 * Owns the session state machine and performs its side effects.
 * The reducer's "request" actions only set `busy`; this hook starts the matching request when `busy`
 * changes and reports the result together with the epoch captured at that moment (stale results are dropped).
 */
export function useResumeSession() {
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialState);

  // Mirrors the reducer state so action functions can see the state their action will produce.
  const latest = useRef<SessionState>(state);
  useEffect(() => {
    latest.current = state;
  });

  const bootstrapInFlight = useRef(false);

  const bootstrap = useCallback(async () => {
    if (bootstrapInFlight.current) return; // StrictMode runs effects twice; send one request only
    bootstrapInFlight.current = true;
    const epoch = latest.current.epoch;
    try {
      const draft = await getCurrentResumeDraft();
      dispatch({ type: 'BOOTSTRAP_SUCCEEDED', draft, epoch });
    } catch (error) {
      dispatch({ type: 'BOOTSTRAP_FAILED', error: toApiError(error), epoch });
    } finally {
      bootstrapInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (state.phase === 'bootstrapping') {
      void bootstrap();
    }
  }, [state.phase, bootstrap]);

  /** Applies an action and returns the states before and after, so callers can detect a started request. */
  const send = useCallback((action: SessionAction) => {
    const before = latest.current;
    const after = sessionReducer(before, action);
    latest.current = after;
    dispatch(action);
    return { before, after };
  }, []);

  const retryBootstrap = useCallback(() => {
    send({ type: 'BOOTSTRAP_RETRY' });
  }, [send]);

  const dismissNotice = useCallback(() => {
    send({ type: 'NOTICE_DISMISSED' });
  }, [send]);

  // Small hint under the composer, e.g. when several files were dropped at once.
  const [selectionNotice, setSelectionNotice] = useState<string | undefined>(undefined);

  const startUpload = useCallback(
    async (file: File, epoch: number) => {
      try {
        const draft = await createResumeDraft(file);
        send({ type: 'UPLOAD_SUCCEEDED', draft, epoch });
      } catch (error) {
        send({ type: 'UPLOAD_FAILED', error: toApiError(error), epoch });
      }
    },
    [send],
  );

  /** A file selection from the picker or a drop. Only one file is used; the rest are ignored with a notice. */
  const requestUpload = useCallback(
    (files: File[]) => {
      const { file, multiple } = pickSingleFile(files);
      if (!file) return;
      setSelectionNotice(multiple ? MULTIPLE_FILES_NOTICE : undefined);
      const { before, after } = send({ type: 'FILE_SELECTED', file });
      if (before.busy === null && after.busy === 'upload') {
        void startUpload(file, after.epoch);
      }
    },
    [send, startUpload],
  );

  const confirmOverwrite = useCallback(() => {
    const { before, after } = send({ type: 'OVERWRITE_CONFIRMED' });
    if (before.busy === null && after.busy === 'upload' && after.pendingFile) {
      void startUpload(after.pendingFile, after.epoch);
    }
  }, [send, startUpload]);

  const cancelOverwrite = useCallback(() => {
    send({ type: 'OVERWRITE_CANCELLED' });
  }, [send]);

  const selectSection = useCallback(
    (section: SectionKey) => {
      send({ type: 'SECTION_SELECTED', section });
    },
    [send],
  );

  return {
    state,
    retryBootstrap,
    selectSection,
    dismissNotice,
    requestUpload,
    confirmOverwrite,
    cancelOverwrite,
    selectionNotice,
    send,
  };
}

export type ResumeSession = ReturnType<typeof useResumeSession>;
