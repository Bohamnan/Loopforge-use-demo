import { describe, expect, it } from 'vitest';
import type { UserListQuery } from '../types/User';
import { fetchMockUserDetail, fetchMockUsers, MOCK_DEPARTMENTS, MOCK_USERS } from './MockUserApi';

const baseQuery = (overrides: Partial<UserListQuery> = {}): UserListQuery => ({
  keyword: '',
  status: 'all',
  role: 'all',
  department: 'all',
  page: 1,
  pageSize: 10,
  demoMode: 'normal',
  ...overrides,
});

describe('MockUserApi', () => {
  it('provides 28 desensitized synthetic records covering roles, statuses, departments, and empty optional fields', () => {
    expect(MOCK_USERS).toHaveLength(28);
    expect(new Set(MOCK_USERS.map((u) => u.role))).toEqual(new Set(['admin', 'hr', 'member']));
    expect(new Set(MOCK_USERS.map((u) => u.status))).toEqual(new Set(['active', 'disabled']));
    expect(new Set(MOCK_USERS.map((u) => u.department))).toEqual(new Set(MOCK_DEPARTMENTS));
    expect(new Set(MOCK_USERS.map((u) => u.created_at)).size).toBe(28);

    const hasEmptyOptional = MOCK_USERS.filter(
      (u) => !u.gender || !u.job_title || !u.location || !u.last_login_at || !u.remark,
    );
    expect(hasEmptyOptional.length).toBeGreaterThanOrEqual(3);
  });

  it('returns users sorted by created_at descending and slices pages accurately', async () => {
    const page1 = await fetchMockUsers(baseQuery({ page: 1, pageSize: 10 }), { delayMs: 0 });
    const page2 = await fetchMockUsers(baseQuery({ page: 2, pageSize: 10 }), { delayMs: 0 });
    const page3 = await fetchMockUsers(baseQuery({ page: 3, pageSize: 10 }), { delayMs: 0 });
    const page4 = await fetchMockUsers(baseQuery({ page: 4, pageSize: 10 }), { delayMs: 0 });

    expect(page1.total).toBe(28);
    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page3.items).toHaveLength(8);
    expect(page4.items).toHaveLength(0);
    expect(page1.items[0]?.user_id).toBe('U-1028');
    expect(page3.items[7]?.user_id).toBe('U-1001');
  });

  it('matches keyword case-insensitively across name, username, phone, and email', async () => {
    const byName = await fetchMockUsers(baseQuery({ keyword: '张明远' }), { delayMs: 0 });
    expect(byName.items.map((u) => u.user_id)).toEqual(['U-1026']);

    const byUsernameUpper = await fetchMockUsers(baseQuery({ keyword: 'ZHANGMINGYUAN' }), { delayMs: 0 });
    expect(byUsernameUpper.items.map((u) => u.user_id)).toEqual(['U-1026']);

    const byPhone = await fetchMockUsers(baseQuery({ keyword: '8028' }), { delayMs: 0 });
    expect(byPhone.items.map((u) => u.user_id)).toEqual(['U-1028']);

    const byEmail = await fetchMockUsers(baseQuery({ keyword: 'LINRX@EXAMPLE.COM' }), { delayMs: 0 });
    expect(byEmail.items.map((u) => u.user_id)).toEqual(['U-1027']);
  });

  it('combines status, role, department, and keyword filters', async () => {
    const res = await fetchMockUsers(
      baseQuery({
        status: 'disabled',
        role: 'member',
        department: '运营部',
        keyword: 'example.com',
      }),
      { delayMs: 0 },
    );
    expect(res.total).toBe(2);
    expect(res.items.map((u) => u.user_id)).toEqual(['U-1023', 'U-1003']);
  });

  it('supports empty and error demo modes', async () => {
    const emptyRes = await fetchMockUsers(baseQuery({ demoMode: 'empty' }), { delayMs: 0 });
    expect(emptyRes).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });

    await expect(fetchMockUsers(baseQuery({ demoMode: 'error' }), { delayMs: 0 })).rejects.toThrow(
      'Mock user list request failed',
    );
  });

  it('fetches user detail copy by user_id and rejects on forced error or unknown id', async () => {
    const detail = await fetchMockUserDetail('U-1026', { delayMs: 0 });
    expect(detail.name).toBe('张明远');
    expect(detail).not.toBe(MOCK_USERS.find((u) => u.user_id === 'U-1026'));

    await expect(fetchMockUserDetail('U-1026', { delayMs: 0, forceError: true })).rejects.toThrow(
      'Mock user detail request failed',
    );
    await expect(fetchMockUserDetail('U-9999', { delayMs: 0 })).rejects.toThrow('Mock user record not found');
  });
});
