import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/ApiError';
import { listSessions } from '../api/SessionApi';
import type { SessionSummary } from '../types/Session';

export interface SessionListState {
  status: 'loading' | 'ready' | 'error';
  items: SessionSummary[];
  error: ApiError | null;
}

let requestSeq = 0;

/**
 * The session list of the side bar. Independent of the session state machine (TD-16): a failed load only affects the
 * list area. Late answers of an older request are dropped.
 */
export function useSessionList() {
  const [state, setState] = useState<SessionListState>({ status: 'loading', items: [], error: null });

  const fetchList = useCallback((mine: { seq: number }) => {
    listSessions().then(
      ({ items }) => {
        if (mine.seq === requestSeq) setState({ status: 'ready', items, error: null });
      },
      (error: unknown) => {
        if (mine.seq !== requestSeq) return;
        const cause = error instanceof ApiError ? error : ApiError.unknown();
        setState((previous) => ({ status: 'error', items: previous.items, error: cause }));
      },
    );
  }, []);

  /** Reloads in the background; the current items stay visible meanwhile (called after successful writes, TD-30). */
  const reload = useCallback(() => {
    requestSeq += 1;
    fetchList({ seq: requestSeq });
  }, [fetchList]);

  /** The retry button: shows the loading state again. */
  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    reload();
  }, [reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload, retry };
}
