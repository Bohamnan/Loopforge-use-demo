import type { ArchivedResume, ResumeListResponse } from '../types/Archive';
import { request } from './ApiClient';
import { isArchivedResume, isResumeList } from './ResponseShapes';

/** GET /resumes: archived resumes, first save time descending. */
export function listResumes(): Promise<ResumeListResponse> {
  return request<ResumeListResponse>('/resumes', { method: 'GET', validate: isResumeList });
}

/** GET /resumes/{id}: archived resume detail (values only). */
export function getResume(id: string): Promise<ArchivedResume> {
  return request<ArchivedResume>(`/resumes/${encodeURIComponent(id)}`, { method: 'GET', validate: isArchivedResume });
}

/** GET /resumes/{id}/file: the original file as a Blob (pdf / jpeg / png). */
export function downloadResumeFile(id: string): Promise<Blob> {
  return request<Blob>(`/resumes/${encodeURIComponent(id)}/file`, { method: 'GET', responseMode: 'blob' });
}
