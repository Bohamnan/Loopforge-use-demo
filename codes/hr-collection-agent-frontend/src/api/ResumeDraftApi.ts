import type { DraftResponse } from '../types/Draft';
import type { ResumeFieldsUpdate } from '../types/ResumeModel';
import { ApiError } from './ApiError';
import { UPLOAD_TIMEOUT_MS, request } from './ApiClient';

/** POST /resume-drafts: upload a resume and synchronously create (or overwrite) the draft. */
export function createResumeDraft(file: File): Promise<DraftResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<DraftResponse>('/resume-drafts', { method: 'POST', body: form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/**
 * GET /resume-drafts/current: restore the draft on page open.
 * 404 draft_not_found is a normal "nothing to restore" outcome: returns null, not thrown, not logged (O-12).
 */
export async function getCurrentResumeDraft(): Promise<DraftResponse | null> {
  try {
    return await request<DraftResponse>('/resume-drafts/current', { method: 'GET', quietCodes: ['draft_not_found'] });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'draft_not_found') {
      return null;
    }
    throw error;
  }
}

/** PATCH /resume-drafts/current: submit corrected / confirmed fields; the response replaces the local draft. */
export function updateCurrentResumeDraft(fields: ResumeFieldsUpdate): Promise<DraftResponse> {
  return request<DraftResponse>('/resume-drafts/current', { method: 'PATCH', body: { fields } });
}
