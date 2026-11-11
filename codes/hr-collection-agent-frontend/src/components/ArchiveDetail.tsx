import { Alert, Button, Drawer, Spin } from 'antd';
import type { ApiError } from '../api/ApiError';
import { formatDateTime } from '../hooks/model/FormatTime';
import { SECTIONS } from '../hooks/model/SectionConfig';
import { valuesAsFields } from '../hooks/model/SectionView';
import type { ArchivedResume } from '../types/Archive';
import ErrorAlert from './ErrorAlert';
import ReadOnlySection from './ReadOnlySection';

/** Saves a blob through a temporary download link and releases the object URL right away (F-02, TD-27). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

interface ArchiveDetailProps {
  open: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  resume: ArchivedResume | null;
  error: ApiError | null;
  fileError: ApiError | null;
  onClose: () => void;
  onOpenFile: (resume: ArchivedResume) => void;
}

/** One archived resume, read-only, with its original file (REQ-FE-08.3, 08.4). */
export default function ArchiveDetail({ open, status, resume, error, fileError, onClose, onOpenFile }: ArchiveDetailProps) {
  const updated = resume && resume.updated_at !== resume.saved_at ? formatDateTime(resume.updated_at) : null;
  return (
    <Drawer open={open} onClose={onClose} title="简历详情" width={560}>
      {status === 'loading' ? <Spin /> : null}
      {error ? <ErrorAlert error={error} /> : null}
      {resume ? (
        <>
          <div className="saved-row">
            <span>原始文件</span>
            <span>{resume.original_file.filename}</span>
          </div>
          <div className="saved-row">
            <span>保存时间</span>
            <span>{formatDateTime(resume.saved_at)}</span>
          </div>
          {updated ? (
            <div className="saved-row">
              <span>最近更新</span>
              <span>{updated}</span>
            </div>
          ) : null}
          <Button disabled={!resume.file_available} onClick={() => onOpenFile(resume)}>
            打开原始文件
          </Button>
          {!resume.file_available ? <Alert type="info" showIcon role="status" message="原始文件暂不可用" /> : null}
          {fileError ? <ErrorAlert error={fileError} /> : null}
          {SECTIONS.map((section) => (
            <section key={section.key} className="section-card" aria-label={section.title}>
              <h3>{section.title}</h3>
              <ReadOnlySection section={section} fields={valuesAsFields(resume.fields)} buffer={{}} showStatus={false} emptyText="未填写" />
            </section>
          ))}
        </>
      ) : null}
    </Drawer>
  );
}
