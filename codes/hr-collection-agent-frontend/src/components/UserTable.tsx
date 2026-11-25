import { Button, Empty, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatDateTime } from '../hooks/model/FormatTime';
import { USER_ROLE_META, USER_STATUS_META } from '../hooks/model/UserDisplay';
import type { DemoSceneMode, UserRecord, UserRole, UserStatus } from '../types/User';

interface UserTableProps {
  items: UserRecord[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  hasActiveFilters: boolean;
  demoMode: DemoSceneMode;
  onPageChange: (page: number, pageSize: number) => void;
  onOpenDetail: (userId: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}

/** Paginated mock user table with horizontal overflow scroll, row click, and distinct empty states. */
export default function UserTable({
  items,
  loading,
  page,
  pageSize,
  total,
  hasActiveFilters,
  demoMode,
  onPageChange,
  onOpenDetail,
  onClearFilters,
  onRefresh,
}: UserTableProps) {
  const columns: ColumnsType<UserRecord> = [
    {
      title: '用户编号',
      dataIndex: 'user_id',
      width: 110,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 110,
      render: (name: string, record) => (
        <button
          type="button"
          className="link-button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(record.user_id);
          }}
        >
          {name}
        </button>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 135,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 200,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (role: UserRole) => {
        const meta = USER_ROLE_META[role];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: UserStatus) => {
        const meta = USER_STATUS_META[status];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (createdAt: string) => formatDateTime(createdAt) ?? '未填写',
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(record.user_id);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  const isFilteredEmpty = hasActiveFilters && demoMode !== 'empty';
  const emptyText = isFilteredEmpty ? (
    <Empty description="未找到符合条件的用户" image={Empty.PRESENTED_IMAGE_SIMPLE}>
      <Button type="primary" onClick={onClearFilters}>
        清空筛选
      </Button>
    </Empty>
  ) : (
    <Empty description="暂无用户数据" image={Empty.PRESENTED_IMAGE_SIMPLE}>
      <Button onClick={onRefresh}>刷新</Button>
    </Empty>
  );

  return (
    <Table<UserRecord>
      rowKey="user_id"
      loading={loading}
      dataSource={items}
      columns={columns}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText }}
      onRow={(record) => ({
        onClick: () => onOpenDetail(record.user_id),
        style: { cursor: 'pointer' },
      })}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50],
        locale: { items_per_page: '条/页' },
        showTotal: (count) => `共 ${count} 条`,
        onChange: onPageChange,
      }}
    />
  );
}
