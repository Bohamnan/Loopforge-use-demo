import { Button, Input, Segmented, Select } from 'antd';
import { MOCK_DEPARTMENTS } from '../api/MockUserApi';
import type { DemoSceneMode, UserRole, UserStatus } from '../types/User';

interface UserFilterBarProps {
  keywordInput: string;
  status: 'all' | UserStatus;
  role: 'all' | UserRole;
  department: 'all' | string;
  demoMode: DemoSceneMode;
  onKeywordInputChange: (value: string) => void;
  onKeywordSearch: (value: string, source?: 'input' | 'clear') => void;
  onStatusChange: (status: 'all' | UserStatus) => void;
  onRoleChange: (role: 'all' | UserRole) => void;
  onDepartmentChange: (department: 'all' | string) => void;
  onReset: () => void;
  onDemoModeChange: (mode: DemoSceneMode) => void;
}

const STATUS_OPTIONS: Array<{ label: string; value: 'all' | UserStatus }> = [
  { label: '全部状态', value: 'all' },
  { label: '启用', value: 'active' },
  { label: '禁用', value: 'disabled' },
];

const ROLE_OPTIONS: Array<{ label: string; value: 'all' | UserRole }> = [
  { label: '全部角色', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: 'HR', value: 'hr' },
  { label: '普通用户', value: 'member' },
];

const DEPARTMENT_OPTIONS: Array<{ label: string; value: 'all' | string }> = [
  { label: '全部部门', value: 'all' },
  ...MOCK_DEPARTMENTS.map((dept) => ({ label: dept, value: dept })),
];

const DEMO_OPTIONS: Array<{ label: string; value: DemoSceneMode }> = [
  { label: '正常数据', value: 'normal' },
  { label: '加载中', value: 'loading' },
  { label: '空数据', value: 'empty' },
  { label: '请求失败', value: 'error' },
];

/** Search, filter, reset, and demo-scene switcher toolbar for the mock user list page. */
export default function UserFilterBar({
  keywordInput,
  status,
  role,
  department,
  demoMode,
  onKeywordInputChange,
  onKeywordSearch,
  onStatusChange,
  onRoleChange,
  onDepartmentChange,
  onReset,
  onDemoModeChange,
}: UserFilterBarProps) {
  return (
    <div className="user-filter-bar">
      <div className="user-filter-controls">
        <Input.Search
          className="user-filter-search"
          aria-label="关键字搜索"
          placeholder="搜索姓名、用户名、手机号、邮箱"
          value={keywordInput}
          onChange={(e) => onKeywordInputChange(e.target.value)}
          onSearch={(value, _event, info) => onKeywordSearch(value, info?.source)}
          enterButton="搜索"
          allowClear
        />
        <Select<'all' | UserStatus>
          className="user-filter-select"
          aria-label="状态筛选"
          value={status}
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
        />
        <Select<'all' | UserRole>
          className="user-filter-select"
          aria-label="角色筛选"
          value={role}
          onChange={onRoleChange}
          options={ROLE_OPTIONS}
        />
        <Select<'all' | string>
          className="user-filter-select"
          aria-label="部门筛选"
          value={department}
          onChange={onDepartmentChange}
          options={DEPARTMENT_OPTIONS}
        />
        <Button onClick={onReset}>重置</Button>
      </div>
      <div className="user-filter-demo">
        <span className="user-filter-demo-label">演示状态：</span>
        <Segmented<DemoSceneMode>
          aria-label="演示状态"
          value={demoMode}
          onChange={onDemoModeChange}
          options={DEMO_OPTIONS}
        />
      </div>
    </div>
  );
}
