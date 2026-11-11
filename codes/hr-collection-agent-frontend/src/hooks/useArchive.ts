import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/ApiError';
import { downloadResumeFile, getResume, listResumes } from '../api/ArchiveApi';
import type { ArchivedResume, ResumeSummary } from '../types/Archive';
import type { OriginalFileContentType } from '../types/Session';

type Load<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data: T | null; error: ApiError | null };
const idle = <T,>(): Load<T> => ({ status: 'idle', data: null, error: null });
const toApiError = (error: unknown) => (error instanceof ApiError ? error : ApiError.unknown());

/** Generic download names: never the candidate's name or the uploaded file name (TD-27, B-03). */
const GENERIC_NAME: Record<OriginalFileContentType, string> = {
  'application/pdf': '原始简历.pdf',
  'image/jpeg': '原始简历.jpg',
  'image/png': '原始简历.png',
};

/**
 * Archived resumes: list, selected detail and the original file. Independent of the session hooks (TD-16).
 * The list is read again each time the page becomes active (false -> true).
 */
export function useArchive({ active }: { active: boolean }) {
  const [list, setList] = useState<Load<ResumeSummary[]>>({ status: 'loading', data: null, error: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Load<ArchivedResume>>(idle);
  const [fileError, setFileError] = useState<ApiError | null>(null);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  /** Reads the list; the previous items stay visible until the answer arrives. */
  const fetchList = useCallback(() => {
    const seq = ++listSeq.current;
    listResumes().then(
      ({ items }) => {
        if (seq === listSeq.current) setList({ status: 'ready', data: items, error: null });
      },
      (error: unknown) => {
        if (seq === listSeq.current) setList((previous) => ({ ...previous, status: 'error', error: toApiError(error) }));
      },
    );
  }, []);

  useEffect(() => {
    if (active) fetchList();
  }, [active, fetchList]);

  /** The retry button: shows the loading state again. */
  const reload = useCallback(() => {
    setList((previous) => ({ ...previous, status: 'loading', error: null }));
    fetchList();
  }, [fetchList]);

  const select = useCallback((id: string | null) => {
    const seq = ++detailSeq.current;
    setSelectedId(id);
    setFileError(null);
    if (id === null) {
      setDetail(idle());
      return;
    }
    setDetail({ status: 'loading', data: null, error: null });
    getResume(id).then(
      (resume) => {
        if (seq === detailSeq.current) setDetail({ status: 'ready', data: resume, error: null });
      },
      (error: unknown) => {
        if (seq === detailSeq.current) setDetail({ status: 'error', data: null, error: toApiError(error) });
      },
    );
  }, []);

  /** Fetches the original file; the component saves it. Errors (file_not_available, resume_not_found) stay on the page. */
  const openFile = useCallback(async (resume: ArchivedResume): Promise<{ blob: Blob; filename: string } | null> => {
    setFileError(null);
    try {
      const blob = await downloadResumeFile(resume.resume_id);
      return { blob, filename: GENERIC_NAME[resume.original_file.content_type] };
    } catch (error) {
      setFileError(toApiError(error));
      return null;
    }
  }, []);

  return { list, reload, selectedId, select, detail, openFile, fileError };
}
