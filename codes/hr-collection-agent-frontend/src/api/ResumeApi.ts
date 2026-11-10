import type { CreateResumeRequest, CreateResumeResponse } from '../types/Resume';
import { request } from './ApiClient';
import { isCreateResumeResponse } from './ResponseShapes';

/**
 * POST /resumes: final confirmation. Call only after the user explicitly clicks "confirm" (B-04, F-03).
 * The endpoint is idempotent on the backend, so a failed call may be retried by the user (C-05).
 */
export function createResume(): Promise<CreateResumeResponse> {
  const body: CreateResumeRequest = { confirmed: true };
  // A 2xx answer of the wrong shape is an error: only a well-formed save response may lead to "saved" (F-03).
  return request<CreateResumeResponse>('/resumes', { method: 'POST', body, validate: isCreateResumeResponse });
}
