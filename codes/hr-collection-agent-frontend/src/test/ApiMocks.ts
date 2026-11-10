import { vi } from 'vitest';
import type { DraftResponse } from '../types/Draft';
import type { ErrorResponse } from '../types/Errors';
import type { CreateResumeResponse } from '../types/Resume';
import type { ResumeFields, StringField, StringListField } from '../types/ResumeModel';

// Test helpers: synthetic data only (B-06). The backend is always mocked, never contacted.

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function errorResponse(status: number, body: Partial<ErrorResponse> & Pick<ErrorResponse, 'code'>): Response {
  return jsonResponse(status, { message: '提示信息', request_id: 'req_test', ...body });
}

export type FetchMock = ReturnType<typeof stubFetch>;

/** Replaces the global fetch with a mock for the current test. */
export function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const mock = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A fetch that never resolves until its signal aborts, like a hanging request. */
export function stubHangingFetch() {
  return stubFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }) as unknown as Response,
  );
}

const scalar = (value: string | null, status: StringField['status'] = 'recognized'): StringField => ({ value, status });
const list = (value: string[], status: StringListField['status'] = 'recognized'): StringListField => ({
  value,
  status,
});

/** Synthetic resume fields covering all four field statuses and empty lists. */
export function sampleFields(): ResumeFields {
  return {
    name: scalar('测试用户甲', 'confirmed'),
    job_title: scalar('供应链经理'),
    expected_city: scalar(null, 'missing'),
    expected_salary: scalar('30-40K', 'uncertain'),
    available_time: scalar(null, 'missing'),
    phone: scalar('13800138000'),
    email: scalar('test.user@example.com'),
    homepage: scalar(null, 'missing'),
    gender: scalar(null, 'missing'),
    birth_month: scalar('1990-05'),
    political_status: scalar(null, 'missing'),
    current_city: scalar('苏州'),
    work_years: scalar('8 年', 'uncertain'),
    highest_education: scalar('硕士'),
    strengths: list(['擅长供应商管理']),
    work_experiences: {
      value: [{ company: '合成公司', position: '主管', start_date: '2018.07', end_date: '至今', responsibilities: [], achievements: [] }],
      status: 'recognized',
    },
    project_experiences: { value: [], status: 'missing' },
    educations: { value: [{ school: '合成大学', major: '管理', degree: '硕士' }], status: 'recognized' },
    skills: list(['Excel']),
    certificates_honors: list([], 'missing'),
    languages: list(['英语 CET-6']),
    self_evaluation: scalar(null, 'missing'),
  };
}

export function sampleDraft(overrides: Partial<DraftResponse> = {}): DraftResponse {
  return {
    draft_id: '00000000-0000-4000-8000-000000000001',
    original_file: { filename: '合成简历.pdf', content_type: 'application/pdf', size_bytes: 1024 },
    fields: sampleFields(),
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    expires_at: '2026-11-17T08:00:00Z',
    ...overrides,
  };
}

export function sampleCreateResumeResponse(overrides: Partial<CreateResumeResponse> = {}): CreateResumeResponse {
  return {
    resume_id: '00000000-0000-4000-8000-000000000002',
    already_saved: false,
    saved_at: '2026-11-10T09:00:00Z',
    ...overrides,
  };
}
