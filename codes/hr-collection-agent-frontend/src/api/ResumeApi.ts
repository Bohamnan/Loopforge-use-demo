import type { CreateResumeRequest, CreateResumeResponse, UpdateResumeRequest, UpdateResumeResponse } from '../types/Resume';
import { request } from './ApiClient';
import { isCreateResumeResponse, isUpdateResumeResponse } from './ResponseShapes';

const resumePath = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/resume`;

/**
 * POST /sessions/{id}/resume: final confirmation. Call only after the user explicitly clicks "confirm" (B-04, F-03).
 * The endpoint is idempotent on the backend, so a failed call may be retried by the user (C-05).
 */
export function createResume(sessionId: string): Promise<CreateResumeResponse> {
  const body: CreateResumeRequest = { confirmed: true };
  // A 2xx answer of the wrong shape is an error: only a well-formed save response may lead to "saved" (F-03).
  return request<CreateResumeResponse>(resumePath(sessionId), { method: 'POST', body, validate: isCreateResumeResponse });
}

/** PUT /sessions/{id}/resume: confirm the update on the diff card. Only a well-formed answer may lead to "updated" (F-03). */
export function updateResume(sessionId: string): Promise<UpdateResumeResponse> {
  const body: UpdateResumeRequest = { confirm_update: true };
  return request<UpdateResumeResponse>(resumePath(sessionId), { method: 'PUT', body, validate: isUpdateResumeResponse });
}
