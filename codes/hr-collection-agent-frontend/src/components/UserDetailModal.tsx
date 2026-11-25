import { Button, Descriptions, Modal, Spin, Tag } from 'antd';
import { formatDateTime } from '../hooks/model/FormatTime';
import { formatUserField, USER_ROLE_META, USER_STATUS_META } from '../hooks/model/UserDisplay';
import type { LoadStatus } from '../hooks/useUserList';
import type { LocalError } from '../hooks/model/SessionReducer';
import type { UserRecord } from '../types/User';
import ErrorAlert from './ErrorAlert';

interface UserDetailModalProps {
  open: boolean;
  status: LoadStatus;
  user: UserRecord | null;
  error: LocalError | null;
  onClose: () => void;
  onRetry: () => void;
}

function formatOptionalDateTime(value: string | null): string {
  if (!value || value.trim() === '') return '未填写';
  return formatDateTime(value) ?? '未填写';
}

/** Centered read-only modal displaying full synthetic user details, loading state, and retry action. */
export default function UserDetailModal({
  open,
  status,
  user,
  error,
  onClose,
  onRetry,
}: UserDetailModalProps) {
  return (
    <Modal
      open={open}
      title="用户详情"
      centered
      width={680}
      maskClosable
      keyboard
      destroyOnHidden
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      {status === 'loading' ? (
        <div className="user-detail-loading" role="status" aria-live="polite">
          <Spin />
          <span>正在加载用户详情...</span>
        </div>
      ) : null}

      {status === 'error' && error ? (
        <div className="user-detail-error">
          <ErrorAlert error={error} />
          <Button type="primary" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : null}

      {status === 'ready' && user ? (
        <div className="user-detail-sections">
          <Descriptions title="基础信息" column={2} size="small" bordered>
            <Descriptions.Item label="用户编号">{user.user_id}</Descriptions.Item>
            <Descriptions.Item label="姓名">{user.name}</Descriptions.Item>
            <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
            <Descriptions.Item label="性别">{formatUserField(user.gender)}</Descriptions.Item>
          </Descriptions>

          <Descriptions title="组织与角色" column={2} size="small" bordered>
            <Descriptions.Item label="角色">
              <Tag color={USER_ROLE_META[user.role].color}>{USER_ROLE_META[user.role].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="所属部门">{user.department}</Descriptions.Item>
            <Descriptions.Item label="岗位" span={2}>
              {formatUserField(user.job_title)}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions title="联系方式" column={2} size="small" bordered>
            <Descriptions.Item label="手机号">{user.phone}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
            <Descriptions.Item label="办公地点" span={2}>
              {formatUserField(user.location)}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions title="账号与时间" column={2} size="small" bordered>
            <Descriptions.Item label="账号状态">
              <Tag color={USER_STATUS_META[user.status].color}>{USER_STATUS_META[user.status].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatOptionalDateTime(user.created_at)}</Descriptions.Item>
            <Descriptions.Item label="最近活跃时间" span={2}>
              {formatOptionalDateTime(user.last_login_at)}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions title="备注" column={1} size="small" bordered>
            <Descriptions.Item label="备注信息">{formatUserField(user.remark)}</Descriptions.Item>
          </Descriptions>
        </div>
      ) : null}
    </Modal>
  );
}
