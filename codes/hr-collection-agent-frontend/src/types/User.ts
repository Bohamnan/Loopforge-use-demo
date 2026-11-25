/** User role enum for the static mock user list page (HR_PR-2). */
export type UserRole = 'admin' | 'hr' | 'member';

/** User account status enum for the static mock user list page (HR_PR-2). */
export type UserStatus = 'active' | 'disabled';

/** Demo scene mode for showcasing loading, empty, and error states cleanly. */
export type DemoSceneMode = 'normal' | 'loading' | 'empty' | 'error';

/** Synthetic desensitized user record stored only in frontend runtime memory (B-06, F-02). */
export interface UserRecord {
  user_id: string;
  name: string;
  username: string;
  gender: string | null;
  phone: string;
  email: string;
  role: UserRole;
  department: string;
  job_title: string | null;
  location: string | null;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
  remark: string | null;
}

/** Query parameters accepted by MockUserApi.fetchMockUsers. */
export interface UserListQuery {
  keyword: string;
  status: 'all' | UserStatus;
  role: 'all' | UserRole;
  department: 'all' | string;
  page: number;
  pageSize: number;
  demoMode: DemoSceneMode;
}

/** Paginated response returned by MockUserApi.fetchMockUsers. */
export interface UserListResult {
  items: UserRecord[];
  total: number;
  page: number;
  pageSize: number;
}
