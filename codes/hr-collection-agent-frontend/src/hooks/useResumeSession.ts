import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError } from '../api/ApiError';
import { getCurrentResumeDraft } from '../api/ResumeDraftApi';
import { initialState, sessionReducer, type SessionAction, type SessionState } from './model/SessionReducer';

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

  return { state, retryBootstrap, dismissNotice, send };
}

export type ResumeSession = ReturnType<typeof useResumeSession>;
