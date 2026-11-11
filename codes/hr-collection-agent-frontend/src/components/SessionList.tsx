import { Button, Skeleton, Tag } from 'antd';
import type { ApiError } from '../api/ApiError';
import { formatDateTime } from '../hooks/model/FormatTime';
import type { SessionStatus, SessionSummary } from '../types/Session';
import ErrorAlert from './ErrorAlert';

interface SessionListProps {
  status: 'loading' | 'ready' | 'error';
  items: SessionSummary[];
  error: ApiError | null;
  currentId: string | null;
  /** While a request is running the list does not respond. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string, status: SessionStatus) => void;
  onRetry: () => void;
}

const STATUS_TAG: Record<SessionStatus, { text: string; color: string }> = {
  reviewing: { text: '校对中', color: 'blue' },
  saved: { text: '已保存', color: 'green' },
};

/** History of sessions: name, status (text + colour), last activity and a delete button per item. */
export default function SessionList({ status, items, error, currentId, disabled, onSelect, onDelete, onRetry }: SessionListProps) {
  if (status === 'loading' && items.length === 0) return <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  return (
    <div className="session-list">
      {status === 'error' && error ? (
        <div>
          <ErrorAlert error={error} />
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : null}
      {status !== 'error' && items.length === 0 ? <p className="session-empty">暂无历史会话</p> : null}
      <ul>
        {items.map((item) => {
          const tag = STATUS_TAG[item.status];
          return (
            <li key={item.session_id} className="session-item">
              <button
                type="button"
                className="session-main"
                aria-current={item.session_id === currentId ? 'true' : undefined}
                disabled={disabled}
                onClick={() => onSelect(item.session_id)}
              >
                <span className="session-name">{item.name}</span>
                <Tag color={tag.color}>{tag.text}</Tag>
                <span className="session-time">{formatDateTime(item.last_active_at)}</span>
              </button>
              <button
                type="button"
                className="session-delete"
                aria-label={`删除会话 ${item.name}`}
                disabled={disabled}
                onClick={() => onDelete(item.session_id, item.status)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
