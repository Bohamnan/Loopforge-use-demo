import { Button } from 'antd';
import type { SavedSummary } from '../hooks/model/SessionReducer';

/** Readable local time for the saved-at timestamp; falls back to the raw text when it cannot be parsed. */
export function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
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
  return (
    <div className="saved-card" role="status">
      {alreadySaved || !summary ? (
        <p className="saved-title">该简历已保存过</p>
      ) : (
        <div data-testid="saved-result">
          <p className="saved-title">已保存</p>
          <div className="saved-row">
            <span>姓名</span>
            <span>{summary.name}</span>
          </div>
          <div className="saved-row">
            <span>原始文件</span>
            <span>{summary.filename}</span>
          </div>
          <div className="saved-row">
            <span>保存时间</span>
            <span>{formatSavedAt(summary.saved_at)}</span>
          </div>
        </div>
      )}
      <Button type="primary" onClick={onUploadNext}>
        上传下一份
      </Button>
    </div>
  );
}
