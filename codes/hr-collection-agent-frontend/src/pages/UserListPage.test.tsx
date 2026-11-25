import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as MockUserApi from '../api/MockUserApi';
import type { UserListResult, UserRecord } from '../types/User';
import UserListPage from './UserListPage';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(props: { active?: boolean; delayMs?: number; detailShouldFail?: boolean } = {}) {
  return render(
    <ConfigProvider theme={{ token: { motion: false } }} button={{ autoInsertSpace: false }}>
      <UserListPage active={props.active ?? true} delayMs={props.delayMs ?? 0} detailShouldFail={props.detailShouldFail} />
    </ConfigProvider>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function selectAntOption(ariaLabel: string, optionText: string) {
  const select = screen.getByRole('combobox', { name: ariaLabel });
  const selector = select.closest('.ant-select-selector') as HTMLElement;
  fireEvent.mouseDown(selector);
  const option = await waitFor(() => {
    const el = document.body.querySelector(
      `.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${optionText}"]`,
    );
    if (!el) throw new Error(`Option ${optionText} not visible`);
    return el as HTMLElement;
  });
  await userEvent.click(option);
}

describe('UserListPage', () => {
  it('shows loading feedback initially and renders 28 mock users ordered by created_at desc with pagination', async () => {
    const deferred = createDeferred<UserListResult>();
    vi.spyOn(MockUserApi, 'fetchMockUsers').mockReturnValueOnce(deferred.promise);

    const { container } = renderPage();
    expect(container.querySelector('.ant-spin-spinning')).toBeInTheDocument();

    const firstPage = await MockUserApi.fetchMockUsers(
      { keyword: '', status: 'all', role: 'all', department: 'all', page: 1, pageSize: 10, demoMode: 'normal' },
      { delayMs: 0 },
    );
    deferred.resolve(firstPage);

    expect(await screen.findByText('陈思远')).toBeInTheDocument();
    expect(screen.getByText('U-1028')).toBeInTheDocument();
    expect(screen.getByText('共 28 条')).toBeInTheDocument();
    expect(screen.queryByText('冯宇航')).not.toBeInTheDocument();

    // Switch to page 2.
    await userEvent.click(screen.getByTitle('2'));
    expect(await screen.findByText('冯宇航')).toBeInTheDocument();
    expect(screen.queryByText('陈思远')).not.toBeInTheDocument();

    // Change page size to 20.
    const sizeSelector = container.querySelector('.ant-pagination-options-size-changer .ant-select-selector') as HTMLElement;
    fireEvent.mouseDown(sizeSelector);
    const pageSizeOption = await waitFor(() => {
      const el = document.body.querySelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="20 条/页"]',
      );
      if (!el) throw new Error('20 条/页 option not visible');
      return el as HTMLElement;
    });
    await userEvent.click(pageSizeOption);

    expect(await screen.findByText('陈思远')).toBeInTheDocument();
    expect(screen.getByText('冯宇航')).toBeInTheDocument();
  });

  it('supports keyword search (case-insensitive, debounce/enter, page reset, clear, and empty guide)', async () => {
    renderPage();
    expect(await screen.findByText('陈思远')).toBeInTheDocument();

    // Go to page 2 first so we verify searching resets page back to 1.
    await userEvent.click(screen.getByTitle('2'));
    expect(await screen.findByText('冯宇航')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('关键字搜索');
    await userEvent.type(searchInput, 'ZHANGMY@EXAMPLE.COM');
    // Debounce should trigger automatically within ~300ms.
    expect(await screen.findByText('张明远')).toBeInTheDocument();
    expect(screen.getByText('共 1 条')).toBeInTheDocument();

    // Clearing restores the full list.
    await userEvent.clear(searchInput);
    expect(await screen.findByText('共 28 条')).toBeInTheDocument();

    // Immediate search via Enter with non-matching keyword shows filtered empty state.
    await userEvent.type(searchInput, '不存在的用户关键字{enter}');
    expect(await screen.findByText('未找到符合条件的用户')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(await screen.findByText('共 28 条')).toBeInTheDocument();
  });

  it('supports combined status, role, and department filters and resets cleanly', async () => {
    renderPage();
    expect(await screen.findByText('陈思远')).toBeInTheDocument();

    await selectAntOption('状态筛选', '禁用');
    await selectAntOption('角色筛选', '普通用户');
    await selectAntOption('部门筛选', '运营部');

    expect(await screen.findByText('共 2 条')).toBeInTheDocument();
    expect(screen.getByText('李晓雯')).toBeInTheDocument();
    expect(screen.getByText('许知夏')).toBeInTheDocument();
    expect(screen.queryByText('陈思远')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(await screen.findByText('共 28 条')).toBeInTheDocument();
    expect(screen.getByText('陈思远')).toBeInTheDocument();
  });

  it('opens centered user detail modal on row or button click, shows "未填写" for empty fields, and preserves list state on close', async () => {
    const detailSpy = vi.spyOn(MockUserApi, 'fetchMockUserDetail');
    renderPage();
    expect(await screen.findByText('周雅婷')).toBeInTheDocument();

    // Filter first to verify closing modal keeps list state.
    await selectAntOption('部门筛选', '人力资源部');
    expect(await screen.findByText('周雅婷')).toBeInTheDocument();

    const row = screen.getByText('周雅婷').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: '查看详情' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('用户详情')).toBeInTheDocument();
    expect(within(dialog).getByText('U-1025')).toBeInTheDocument();
    expect(within(dialog).getByText('人力资源部')).toBeInTheDocument();
    expect(within(dialog).getAllByText('未填写').length).toBeGreaterThanOrEqual(4);
    expect(detailSpy).toHaveBeenCalledTimes(1);

    // Close via ESC key.
    fireEvent.keyDown(dialog, { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('周雅婷')).toBeInTheDocument();
  });

  it('retries failed detail load inside the modal without disturbing underlying list state', async () => {
    const { container } = renderPage({ detailShouldFail: true });
    expect(await screen.findByText('陈思远')).toBeInTheDocument();

    const row = screen.getByText('陈思远').closest('tr') as HTMLElement;
    await userEvent.click(row);

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('用户详情加载失败，请稍后重试')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '重试' }));
    expect(await within(dialog).findByText('技术总监')).toBeInTheDocument();
    expect(within(container.querySelector('.ant-table') as HTMLElement).getByText('陈思远')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('supports demo modes (loading, empty, error) and preserves filters across error retry recovery', async () => {
    const { container } = renderPage();
    expect(await screen.findByText('陈思远')).toBeInTheDocument();

    // Apply keyword before triggering error demo mode.
    const searchInput = screen.getByLabelText('关键字搜索');
    await userEvent.type(searchInput, '张明远{enter}');
    expect(await screen.findByText('共 1 条')).toBeInTheDocument();

    await userEvent.click(screen.getByText('加载中'));
    expect(container.querySelector('.ant-spin-spinning')).toBeInTheDocument();

    await userEvent.click(screen.getByText('空数据'));
    expect(await screen.findByText('暂无用户数据')).toBeInTheDocument();

    await userEvent.click(screen.getByText('请求失败'));
    expect(await screen.findByText('用户列表加载失败，请点击重试')).toBeInTheDocument();
    expect(searchInput).toHaveValue('张明远');

    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('张明远')).toBeInTheDocument();
    expect(screen.getByText('共 1 条')).toBeInTheDocument();
  });

  it('adopts only the latest response when rapid filter or detail requests resolve out of order', async () => {
    const initial = await MockUserApi.fetchMockUsers(
      { keyword: '', status: 'all', role: 'all', department: 'all', page: 1, pageSize: 10, demoMode: 'normal' },
      { delayMs: 0 },
    );
    const req1 = createDeferred<UserListResult>();
    const req2 = createDeferred<UserListResult>();
    const fetchSpy = vi
      .spyOn(MockUserApi, 'fetchMockUsers')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(req1.promise)
      .mockReturnValueOnce(req2.promise);

    renderPage();
    expect(await screen.findByText('陈思远')).toBeInTheDocument();

    await selectAntOption('状态筛选', '启用');
    await selectAntOption('状态筛选', '禁用');
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Latest request resolves first, stale request resolves last.
    req2.resolve({
      items: [MockUserApi.MOCK_USERS.find((u) => u.user_id === 'U-1023')!],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    expect(await screen.findByText('李晓雯')).toBeInTheDocument();

    req1.resolve({
      items: [MockUserApi.MOCK_USERS.find((u) => u.user_id === 'U-1028')!],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    await Promise.resolve();
    expect(screen.getByText('李晓雯')).toBeInTheDocument();
    expect(screen.queryByText('陈思远')).not.toBeInTheDocument();

    // Detail race protection.
    const detail1 = createDeferred<UserRecord>();
    const detail2 = createDeferred<UserRecord>();
    vi.spyOn(MockUserApi, 'fetchMockUserDetail')
      .mockReturnValueOnce(detail1.promise)
      .mockReturnValueOnce(detail2.promise);

    await userEvent.click(screen.getByText('李晓雯'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    // Re-open with a fresh selection before the stale request resolves.
    req2.resolve({ items: [], total: 0, page: 1, pageSize: 10 });
    await userEvent.click(screen.getByText('李晓雯'));
    detail2.resolve(MockUserApi.MOCK_USERS.find((u) => u.user_id === 'U-1027')!);
    expect(await within(await screen.findByRole('dialog')).findByText('林若曦')).toBeInTheDocument();

    detail1.resolve(MockUserApi.MOCK_USERS.find((u) => u.user_id === 'U-1028')!);
    await Promise.resolve();
    expect(within(screen.getByRole('dialog')).getByText('林若曦')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByText('陈思远')).not.toBeInTheDocument();
  });

  it('never logs sensitive user data to console and never touches browser storage (B-03, F-02)', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    renderPage();
    expect(await screen.findByText('陈思远')).toBeInTheDocument();
    await userEvent.click(screen.getByText('陈思远'));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByText('请求失败'));
    await screen.findByText('用户列表加载失败，请点击重试');

    const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('陈思远');
    expect(logged).not.toContain('138****8028');
    expect(logged).not.toContain('chensy@example.com');
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
