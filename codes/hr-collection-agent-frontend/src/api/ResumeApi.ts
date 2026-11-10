import type { CreateResumeRequest, CreateResumeResponse } from '../types/Resume';
import { request } from './ApiClient';

/**
 * POST /resumes: final confirmation. Call only after the user explicitly clicks "confirm" (B-04, F-03).
 * The endpoint is idempotent on the backend, so a failed call may be retried by the user (C-05).
 */
export function createResume(): Promise<CreateResumeResponse> {
  const body: CreateResumeRequest = { confirmed: true };
  return request<CreateResumeResponse>('/resumes', { method: 'POST', body });
}
