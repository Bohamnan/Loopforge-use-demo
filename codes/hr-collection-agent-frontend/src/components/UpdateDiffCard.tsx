import { Button } from 'antd';
import { ApiError } from '../api/ApiError';
import { labelOfField } from '../hooks/model/SectionConfig';
import type { LocalError } from '../hooks/model/SessionReducer';
import type { UpdateDiff } from '../hooks/model/UpdateDiff';
import ChangeRows, { type ChangeRow } from './ChangeRows';
import ErrorAlert from './ErrorAlert';

interface UpdateDiffCardProps {
  diff: UpdateDiff;
  /** The PUT (or its verification read) is running. */
  busy: boolean;
  error?: ApiError | LocalError | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** "重新读取核对" after an unknown result. */
  onVerify: () => void;
}

const UNKNOWN = ['client_timeout', 'network_error', 'unknown_error'];

/**
 * Differences between the saved record and "this time" content (REQ-FE-09.2). Every field the update would clear is
 * listed and marked "将被清空" (red line, TD-23). "确认更新" is the only way to start the update.
 */
export default function UpdateDiffCard({ diff, busy, error = null, onConfirm, onCancel, onVerify }: UpdateDiffCardProps) {
  const rows: ChangeRow[] = diff.changed.map((item) => ({
    key: item.field,
    field: item.field,
    label: labelOfField(item.field),
    oldValue: item.oldValue,
    newValue: item.newValue,
    note: item.clears ? '将被清空' : undefined,
    highlight: item.clears,
  }));
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div className="update-diff-card" data-focus-key="update-diff" tabIndex={-1} aria-label="更新差异">
      <div className="suggestion-title">按本次内容更新</div>
      <p>
        原始文件：原 {diff.file.oldName} → 新 {diff.file.newName}
      </p>
      {rows.length > 0 ? <ChangeRows rows={rows} /> : <p className="value-empty">除文件外无字段差异</p>}
      {diff.sameCount > 0 && rows.length > 0 ? <p className="value-empty">其余 {diff.sameCount} 项相同</p> : null}
      {error ? <ErrorAlert error={error} /> : null}
      {code === 'save_failed' ? <p className="value-empty">已有简历未改变。</p> : null}
      {code !== null && UNKNOWN.includes(code) ? (
        <p className="value-empty">
          无法确认是否已更新。可以重试，或
          <Button type="link" size="small" disabled={busy} onClick={onVerify}>
            重新读取核对
          </Button>
        </p>
      ) : null}
      <div className="suggestion-actions">
        <Button type="primary" loading={busy} disabled={busy} onClick={onConfirm}>
          确认更新
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
