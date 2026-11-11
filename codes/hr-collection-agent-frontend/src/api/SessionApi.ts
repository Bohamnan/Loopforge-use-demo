import type { SessionDetail, SessionFieldsResponse, SessionListResponse } from '../types/Session';
import type { ResumeFieldsUpdate } from '../types/ResumeModel';
import { ApiError } from './ApiError';
import { UPLOAD_TIMEOUT_MS, request } from './ApiClient';
import { isSessionDetail, isSessionFieldsResponse, isSessionList } from './ResponseShapes';

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;

/** POST /sessions: upload a resume; always creates a new session (never overwrites another one). */
export function createSession(file: File): Promise<SessionDetail> {
  const form = new FormData();
  form.append('file', file);
  return request<SessionDetail>('/sessions', { method: 'POST', body: form, timeoutMs: UPLOAD_TIMEOUT_MS, validate: isSessionDetail });
}

/** GET /sessions: all sessions of this browser, newest activity first. */
export function listSessions(): Promise<SessionListResponse> {
  return request<SessionListResponse>('/sessions', { method: 'GET', validate: isSessionList });
}

/** GET /sessions/{id}: the full session. Reading does not refresh the activity time. */
export function getSession(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(sessionPath(id), { method: 'GET', validate: isSessionDetail });
}

/** DELETE /sessions/{id}: 204 on success; a missing session counts as deleted (quiet, not logged). */
export async function deleteSession(id: string): Promise<void> {
  try {
    await request<void>(sessionPath(id), { method: 'DELETE', responseMode: 'none', quietCodes: ['session_not_found'] });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'session_not_found') return;
    throw error;
  }
}

/** PATCH /sessions/{id}/fields: submit corrected / confirmed fields; the response replaces the local fields. */
export function updateSessionFields(id: string, fields: ResumeFieldsUpdate): Promise<SessionFieldsResponse> {
  return request<SessionFieldsResponse>(`${sessionPath(id)}/fields`, { method: 'PATCH', body: { fields }, validate: isSessionFieldsResponse });
}
