import { Button } from 'antd';
import type { SavedSummary } from '../hooks/model/SessionReducer';

/** Readable local time for the saved-at timestamp, or null when it cannot be read (the api layer already rejects such values). */
export function formatSavedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('zh-CN', { hour12: false });
}

interface SavedResultCardProps {
  /** Name, original file name and saved time; null when the resume had been saved before. */
  summary: SavedSummary | null;
  alreadySaved: boolean;
  onUploadNext: () => void;
}

/**
 * Result of the final confirmation. It is only rendered after the backend reported success (F-03).
 * For an already saved resume it shows one sentence and nothing of the existing record (D-04).
 * No record number or resume id is shown (P-09).
 */
export default function SavedResultCard({ summary, alreadySaved, onUploadNext }: SavedResultCardProps) {
  const savedAt = summary ? formatSavedAt(summary.saved_at) : null;
  return (
    <div className="saved-card" role="status">
      {alreadySaved || !summary ? (
        <p className="saved-title" data-focus-key="saved" tabIndex={-1}>
          该简历已保存过
        </p>
      ) : (
        <div data-testid="saved-result">
          <p className="saved-title" data-focus-key="saved" tabIndex={-1}>
            已保存
          </p>
          <div className="saved-row">
            <span>姓名</span>
            <span>{summary.name}</span>
          </div>
          <div className="saved-row">
            <span>原始文件</span>
            <span>{summary.filename}</span>
          </div>
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
