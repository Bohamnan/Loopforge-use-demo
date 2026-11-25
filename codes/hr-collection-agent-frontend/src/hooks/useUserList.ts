import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMockUserDetail, fetchMockUsers } from '../api/MockUserApi';
import type { LocalError } from './model/SessionReducer';
import type { DemoSceneMode, UserListQuery, UserRecord, UserRole, UserStatus } from '../types/User';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseUserListOptions {
  /** Whether the user list tab is currently visible. */
  active: boolean;
  /** Optional simulated latency in ms (defaults to MockUserApi default 200ms; pass 0 in deterministic tests). */
  delayMs?: number;
  /** Optional test/demo flag to fail the initial detail fetch so retry recovery can be verified. */
  detailShouldFail?: boolean;
}

const INITIAL_QUERY: UserListQuery = {
  keyword: '',
  status: 'all',
  role: 'all',
  department: 'all',
  page: 1,
  pageSize: 10,
  demoMode: 'normal',
};

const KEYWORD_DEBOUNCE_MS = 250;

const LIST_ERROR: LocalError = {
  kind: 'local',
  message: '用户列表加载失败，请点击重试',
};

const DETAIL_ERROR: LocalError = {
  kind: 'local',
  message: '用户详情加载失败，请稍后重试',
};

interface ListState {
  status: LoadStatus;
  items: UserRecord[];
  total: number;
  error: LocalError | null;
}

interface DetailState {
  status: LoadStatus;
  data: UserRecord | null;
  error: LocalError | null;
}

/**
 * Manages the static mock user list, filters, pagination, demo scene mode, and detail modal state.
 * Keeps state across tab switches (TD-25) and discards stale responses via monotonic sequence counters.
 */
export function useUserList({ active, delayMs, detailShouldFail = false }: UseUserListOptions) {
  const [query, setQuery] = useState<UserListQuery>(INITIAL_QUERY);
  const [keywordInput, setKeywordInput] = useState('');
  const [listState, setListState] = useState<ListState>({
    status: 'loading',
    items: [],
    total: 0,
    error: null,
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'idle',
    data: null,
    error: null,
  });

  const queryRef = useRef<UserListQuery>(INITIAL_QUERY);
  const hasActivatedRef = useRef(false);
  const mountedRef = useRef(true);
  const listSeqRef = useRef(0);
  const detailSeqRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearDebounce();
    };
  }, [clearDebounce]);

  const executeListFetch = useCallback(
    (targetQuery: UserListQuery) => {
      const seq = ++listSeqRef.current;
      if (targetQuery.demoMode === 'loading') {
        return;
      }

      fetchMockUsers(targetQuery, { delayMs }).then(
        (result) => {
          if (!mountedRef.current || seq !== listSeqRef.current) return;
          setListState({
            status: 'ready',
            items: result.items,
            total: result.total,
            error: null,
          });
        },
        () => {
          if (!mountedRef.current || seq !== listSeqRef.current) return;
          setListState((prev) => ({
            ...prev,
            status: 'error',
            error: LIST_ERROR,
          }));
        },
      );
    },
    [delayMs],
  );

  // Trigger initial load only on first activation so tab switches preserve existing filters and data (TD-25).
  useEffect(() => {
    if (active && !hasActivatedRef.current) {
      hasActivatedRef.current = true;
      executeListFetch(queryRef.current);
    }
  }, [active, executeListFetch]);

  const applyQuery = useCallback(
    (patch: Partial<UserListQuery>) => {
      const next: UserListQuery = { ...queryRef.current, ...patch };
      queryRef.current = next;
      setQuery(next);
      setListState((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
      }));
      executeListFetch(next);
    },
    [executeListFetch],
  );

  const commitKeyword = useCallback(
    (keyword: string) => {
      applyQuery({ keyword, page: 1 });
    },
    [applyQuery],
  );

  const onKeywordInputChange = useCallback(
    (value: string) => {
      setKeywordInput(value);
      clearDebounce();
      if (value === '') {
        if (queryRef.current.keyword !== '') {
          commitKeyword('');
        }
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        commitKeyword(value);
      }, KEYWORD_DEBOUNCE_MS);
    },
    [clearDebounce, commitKeyword],
  );

  const onKeywordSearch = useCallback(
    (value: string, source?: 'input' | 'clear') => {
      clearDebounce();
      setKeywordInput(value);
      if (source === 'clear' && queryRef.current.keyword === '') {
        return;
      }
      commitKeyword(value);
    },
    [clearDebounce, commitKeyword],
  );

  const setStatusFilter = useCallback(
    (status: 'all' | UserStatus) => {
      applyQuery({ status, page: 1 });
    },
    [applyQuery],
  );

  const setRoleFilter = useCallback(
    (role: 'all' | UserRole) => {
      applyQuery({ role, page: 1 });
    },
    [applyQuery],
  );

  const setDepartmentFilter = useCallback(
    (department: 'all' | string) => {
      applyQuery({ department, page: 1 });
    },
    [applyQuery],
  );

  const setPagination = useCallback(
    (page: number, pageSize: number) => {
      const sizeChanged = pageSize !== queryRef.current.pageSize;
      applyQuery({
        page: sizeChanged ? 1 : page,
        pageSize,
      });
    },
    [applyQuery],
  );

  const setDemoMode = useCallback(
    (demoMode: DemoSceneMode) => {
      applyQuery({ demoMode, page: demoMode === 'empty' ? 1 : queryRef.current.page });
    },
    [applyQuery],
  );

  const resetFilters = useCallback(() => {
    clearDebounce();
    setKeywordInput('');
    applyQuery({
      keyword: '',
      status: 'all',
      role: 'all',
      department: 'all',
      page: 1,
      demoMode: queryRef.current.demoMode === 'empty' ? 'normal' : queryRef.current.demoMode,
    });
  }, [applyQuery, clearDebounce]);

  const retryList = useCallback(() => {
    const current = queryRef.current;
    if (current.demoMode === 'error') {
      applyQuery({ demoMode: 'normal' });
      return;
    }
    setListState((prev) => ({ ...prev, status: 'loading', error: null }));
    executeListFetch(current);
  }, [applyQuery, executeListFetch]);

  const loadDetail = useCallback(
    (userId: string, forceError: boolean) => {
      const seq = ++detailSeqRef.current;
      setDetailState({ status: 'loading', data: null, error: null });
      fetchMockUserDetail(userId, { delayMs, forceError }).then(
        (record) => {
          if (!mountedRef.current || seq !== detailSeqRef.current) return;
          setDetailState({ status: 'ready', data: record, error: null });
        },
        () => {
          if (!mountedRef.current || seq !== detailSeqRef.current) return;
          setDetailState({ status: 'error', data: null, error: DETAIL_ERROR });
        },
      );
    },
    [delayMs],
  );

  const openDetail = useCallback(
    (userId: string) => {
      setSelectedUserId(userId);
      const shouldFail = detailShouldFail || queryRef.current.demoMode === 'error';
      loadDetail(userId, shouldFail);
    },
    [detailShouldFail, loadDetail],
  );

  const closeDetail = useCallback(() => {
    detailSeqRef.current += 1;
    setSelectedUserId(null);
    setDetailState({ status: 'idle', data: null, error: null });
  }, []);

  const retryDetail = useCallback(() => {
    if (!selectedUserId) return;
    loadDetail(selectedUserId, false);
  }, [loadDetail, selectedUserId]);

  const hasActiveFilters =
    query.keyword.trim() !== '' ||
    query.status !== 'all' ||
    query.role !== 'all' ||
    query.department !== 'all';

  return {
    query,
    keywordInput,
    status: listState.status,
    items: listState.items,
    total: listState.total,
    error: listState.error,
    hasActiveFilters,
    selectedUserId,
    detailStatus: detailState.status,
    detailData: detailState.data,
    detailError: detailState.error,
    onKeywordInputChange,
    onKeywordSearch,
    setStatusFilter,
    setRoleFilter,
    setDepartmentFilter,
    setPagination,
    setDemoMode,
    resetFilters,
    retryList,
    openDetail,
    closeDetail,
    retryDetail,
  };
}
