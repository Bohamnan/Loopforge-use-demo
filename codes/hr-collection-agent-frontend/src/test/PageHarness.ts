import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumeFields } from '../types/ResumeModel';
import { SAMPLE_SESSION_ID, applyPatch, jsonResponse, sampleFields, sampleSessionDetail, stubFetch } from './ApiMocks';

export type FieldsPatch = { fields: Record<string, unknown> };

/** Draft-like holder kept from the v1 tests so their assertions stay unchanged. */
export const sampleDraft = () => ({ fields: sampleFields() });

/** Response of PATCH /sessions/{id}/fields for the given fields. */
export const fieldsResponse = (fields: ResumeFields) =>
  jsonResponse(200, { session_id: SAMPLE_SESSION_ID, fields, updated_at: '2026-11-10T08:30:00Z' });

/**
 * fetch stub for page tests that open a reviewing session by uploading a file:
 * POST /sessions -> the session, PATCH .../fields -> applies the body (or `onPatch`).
 */
export function sessionStub(draft: { fields: ResumeFields }, onPatch?: (body: FieldsPatch) => Response | Promise<Response>) {
  let current = draft.fields;
  return stubFetch((url, init) => {
    if (init.method === 'POST' && url === '/api/v1/sessions') return jsonResponse(201, sampleSessionDetail('reviewing', { fields: current }));
    const body = JSON.parse(init.body as string) as FieldsPatch;
    if (onPatch) return onPatch(body) as Response;
    current = applyPatch(current, body.fields);
    return fieldsResponse(current);
  });
}

export async function uploadResume(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['%PDF'], '合成简历.pdf', { type: 'application/pdf' }));
}

export const SECTIONS_READY = () => screen.findByRole('heading', { name: /基本信息/ });
