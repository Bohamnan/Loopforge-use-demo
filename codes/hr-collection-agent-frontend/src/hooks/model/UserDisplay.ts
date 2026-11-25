import type { UserRole, UserStatus } from '../../types/User';

export interface TagMeta {
  label: string;
  color?: string;
}

/** Display labels and Ant Design Tag colors for mock user roles (HR_PR-2). */
export const USER_ROLE_META: Record<UserRole, TagMeta> = {
  admin: { label: '管理员', color: 'blue' },
  hr: { label: 'HR', color: 'cyan' },
  member: { label: '普通用户' },
};

/** Display labels and Ant Design Tag colors for mock user statuses (HR_PR-2). */
export const USER_STATUS_META: Record<UserStatus, TagMeta> = {
  active: { label: '启用', color: 'success' },
  disabled: { label: '禁用', color: 'default' },
};

/** Formats optional string fields uniformly, falling back to '未填写' when null or blank. */
export function formatUserField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '未填写';
  const trimmed = value.trim();
  return trimmed === '' ? '未填写' : trimmed;
}
