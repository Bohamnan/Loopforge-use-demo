import { Button } from 'antd';
import type { ApiError } from '../api/ApiError';
import ErrorAlert from './ErrorAlert';

interface BootstrapErrorPanelProps {
  error: ApiError;
  onRetry: () => void;
}

/**
 * The draft could not be read. This is deliberately not the empty state: offering an upload here
 * could overwrite a real draft that still exists on the server (ruling F-03).
 */
export default function BootstrapErrorPanel({ error, onRetry }: BootstrapErrorPanelProps) {
  return (
    <div className="welcome-panel">
      <p>未能读取已有草稿，请重试。在读取成功前不能上传新的简历，以免覆盖尚未确认的内容。</p>
      <ErrorAlert error={error} />
      <div style={{ marginTop: 16 }}>
        <Button type="primary" onClick={onRetry}>
          重试
        </Button>
      </div>
    </div>
  );
}
