import type { ReactNode } from 'react';
import ArchiveDetail, { saveBlob } from '../components/ArchiveDetail';
import ArchiveList from '../components/ArchiveList';
import AppShell from '../components/AppShell';
import ErrorAlert from '../components/ErrorAlert';
import { useArchive } from '../hooks/useArchive';

interface ArchivePageProps {
  /** The page is shown; the list is read again each time it becomes active. */
  active: boolean;
  nav?: ReactNode;
}

/** Archived resumes: list and detail. Page orchestration only; requests go through useArchive. */
export default function ArchivePage({ active, nav }: ArchivePageProps) {
  const { list, reload, selectedId, select, detail, openFile, fileError } = useArchive({ active });
  return (
    <AppShell nav={nav} showNewChat={false}>
      <div className="archive-page">
        <h2>已归档简历</h2>
        {list.status === 'error' && list.error ? (
          <div>
            <ErrorAlert error={list.error} />
            <button type="button" className="link-button" onClick={reload}>
              重试
            </button>
          </div>
        ) : null}
        <ArchiveList items={list.data ?? []} loading={list.status === 'loading'} onOpen={select} />
        <ArchiveDetail
          open={selectedId !== null}
          status={detail.status}
          resume={detail.data}
          error={detail.error}
          fileError={fileError}
          onClose={() => select(null)}
          onOpenFile={(resume) => {
            void openFile(resume).then((file) => {
              if (file) saveBlob(file.blob, file.filename);
            });
          }}
        />
      </div>
    </AppShell>
  );
}
