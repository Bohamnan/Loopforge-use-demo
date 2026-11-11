import { Button } from 'antd';
import { formatDateTime } from '../hooks/model/FormatTime';
import type { SavedSummary } from '../hooks/model/SessionReducer';

/** Kept as an alias: the formatter moved to hooks/model/FormatTime (v2, shared by lists, messages and archive). */
export const formatSavedAt = formatDateTime;

/** saved = this confirmation created the record; already_saved = it hit an existing record (X-06); updated = the confirmed update succeeded. */
export type SavedResultKind = 'saved' | 'already_saved' | 'updated';

interface SavedResultCardProps {
  kind: SavedResultKind;
  /** Name, original file name and saved time of a fresh save; not shown for already_saved. */
  summary: SavedSummary | null;
  onUploadNext: () => void;
}

/**
 * Result of the final confirmation. It is only rendered after the backend reported success (F-03).
 * For an already saved resume it shows one sentence; the existing record is shown read-only by the saved session view (X-06).
 * No record number or resume id is shown (P-09).
 */
export default function SavedResultCard({ kind, summary, onUploadNext }: SavedResultCardProps) {
  const savedAt = summary ? formatSavedAt(summary.saved_at) : null;
  return (
    <div className="saved-card" role="status">
      {kind === 'already_saved' || kind === 'updated' ? (
        <p className="saved-title" data-focus-key="saved" tabIndex={-1}>
          {kind === 'updated' ? '已更新' : '该简历已保存过'}
        </p>
      ) : (
        <div data-testid="saved-result">
          <p className="saved-title" data-focus-key="saved" tabIndex={-1}>
            已保存
          </p>
          {summary ? (
            <>
              <div className="saved-row">
                <span>姓名</span>
                <span>{summary.name}</span>
              </div>
              <div className="saved-row">
                <span>原始文件</span>
                <span>{summary.filename}</span>
              </div>
            </>
          ) : null}
          {savedAt ? (
            <div className="saved-row">
              <span>保存时间</span>
              <span>{savedAt}</span>
            </div>
          ) : null}
        </div>
      )}
      <Button type="primary" onClick={onUploadNext}>
        上传下一份
      </Button>
    </div>
  );
}
