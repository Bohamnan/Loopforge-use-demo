import { Button } from 'antd';
import type { ReactNode } from 'react';
import AppShell from '../components/AppShell';
import ErrorAlert from '../components/ErrorAlert';
import UserDetailModal from '../components/UserDetailModal';
import UserFilterBar from '../components/UserFilterBar';
import UserTable from '../components/UserTable';
import { useUserList } from '../hooks/useUserList';

interface UserListPageProps {
  /** Whether this tab is currently visible; initial data loads on first activation (TD-25). */
  active: boolean;
  nav?: ReactNode;
  /** Optional simulated delay in ms for deterministic testing. */
  delayMs?: number;
  /** Optional flag to simulate initial detail load failure for retry testing. */
  detailShouldFail?: boolean;
}

/** Static mock user list page: orchestrates filter bar, table, error banner, and detail modal. */
export default function UserListPage({ active, nav, delayMs, detailShouldFail }: UserListPageProps) {
  const {
    query,
    keywordInput,
    status,
    items,
    total,
    error,
    hasActiveFilters,
    selectedUserId,
    detailStatus,
    detailData,
    detailError,
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
  } = useUserList({ active, delayMs, detailShouldFail });

  return (
    <AppShell nav={nav} showNewChat={false}>
      <div className="user-list-page">
        <div className="user-list-header">
          <div>
            <h2>用户列表</h2>
            <p className="user-list-subtitle">静态 Mock 演示数据（仅前端内存展示，不连接真实账号服务）</p>
          </div>
        </div>

        <UserFilterBar
          keywordInput={keywordInput}
          status={query.status}
          role={query.role}
          department={query.department}
          demoMode={query.demoMode}
          onKeywordInputChange={onKeywordInputChange}
          onKeywordSearch={onKeywordSearch}
          onStatusChange={setStatusFilter}
          onRoleChange={setRoleFilter}
          onDepartmentChange={setDepartmentFilter}
          onReset={resetFilters}
          onDemoModeChange={setDemoMode}
        />

        {status === 'error' && error ? (
          <div className="user-list-error">
            <ErrorAlert error={error} />
            <Button type="primary" onClick={retryList}>
              重试
            </Button>
          </div>
        ) : (
          <UserTable
            items={items}
            loading={status === 'loading'}
            page={query.page}
            pageSize={query.pageSize}
            total={total}
            hasActiveFilters={hasActiveFilters}
            demoMode={query.demoMode}
            onPageChange={setPagination}
            onOpenDetail={openDetail}
            onClearFilters={resetFilters}
            onRefresh={retryList}
          />
        )}

        <UserDetailModal
          open={selectedUserId !== null}
          status={detailStatus}
          user={detailData}
          error={detailError}
          onClose={closeDetail}
          onRetry={retryDetail}
        />
      </div>
    </AppShell>
  );
}
