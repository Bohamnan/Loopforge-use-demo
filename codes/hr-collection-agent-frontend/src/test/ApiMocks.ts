import { vi } from 'vitest';
import type { ArchivedResume } from '../types/Archive';
import type { ChatMessage, SendMessageResponse, Suggestion } from '../types/Conversation';
import type { SessionDetail, SessionSummary } from '../types/Session';
import type { ErrorResponse } from '../types/Errors';
import type { CreateResumeResponse } from '../types/Resume';
import { RESUME_FIELD_KEYS, type ResumeFields, type ResumeValues, type StringField, type StringListField } from '../types/ResumeModel';

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

/** Drops the field statuses (X-07: saved content carries values only). */
export function fieldsToValues(fields: ResumeFields): ResumeValues {
  const values: Record<string, unknown> = {};
  for (const key of RESUME_FIELD_KEYS) values[key] = structuredClone(fields[key].value);
  return values as unknown as ResumeValues;
}

export const SAMPLE_SESSION_ID = '00000000-0000-4000-8000-000000000001';
export const SAMPLE_RESUME_ID = '00000000-0000-4000-8000-000000000002';
const SAMPLE_FILE = { filename: '合成简历.pdf', content_type: 'application/pdf', size_bytes: 1024 } as const;

export function sampleArchivedResume(overrides: Partial<ArchivedResume> = {}): ArchivedResume {
  return {
    resume_id: SAMPLE_RESUME_ID,
    fields: fieldsToValues(sampleFields()),
    original_file: { ...SAMPLE_FILE },
    file_available: true,
    saved_at: '2026-11-10T09:00:00Z',
    updated_at: '2026-11-10T09:00:00Z',
    ...overrides,
  };
}

export type SampleSessionKind = 'reviewing' | 'saved' | 'pending' | 'applied';

/**
 * Synthetic SessionDetail covering the four shapes of the contract:
 * reviewing (fields with statuses), saved/none, saved/pending (candidate differs: job_title changed, expected_salary cleared,
 * other file) and saved/applied (candidate already applied).
 */
export function sampleSessionDetail(kind: SampleSessionKind = 'reviewing', overrides: Partial<SessionDetail> = {}): SessionDetail {
  const base = {
    session_id: SAMPLE_SESSION_ID,
    name: '简历 · 测试用户甲',
    original_file: { ...SAMPLE_FILE },
    messages: [] as ChatMessage[],
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    last_active_at: '2026-11-10T08:00:00Z',
  };
  if (kind === 'reviewing') {
    return { ...base, status: 'reviewing', update_state: 'none', fields: sampleFields(), resume: null, update_candidate: null, ...overrides };
  }
  const resume = sampleArchivedResume();
  const candidateFields: ResumeValues = { ...resume.fields, job_title: '采购总监', expected_salary: null };
  const candidateFile = { filename: '合成简历-新.pdf', content_type: 'application/pdf', size_bytes: 2048 } as const;
  const hasCandidate = kind === 'pending' || kind === 'applied';
  return {
    ...base,
    status: 'saved',
    update_state: kind === 'saved' ? 'none' : kind,
    original_file: hasCandidate ? { ...candidateFile } : base.original_file,
    fields: null,
    resume:
      kind === 'applied'
        ? { ...resume, fields: candidateFields, original_file: { ...candidateFile }, updated_at: '2026-11-10T10:00:00Z' }
        : resume,
    update_candidate: kind === 'pending' ? { fields: candidateFields, original_file: { ...candidateFile } } : null,
    ...overrides,
  };
}

export function sampleSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return { session_id: SAMPLE_SESSION_ID, name: '简历 · 测试用户甲', status: 'reviewing', last_active_at: '2026-11-10T08:00:00Z', ...overrides };
}

/** A suggestion for job_title; applicable and pending unless overridden. */
export function sampleSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    suggestion_id: '00000000-0000-4000-8000-0000000000a1',
    field: 'job_title',
    old_value: '供应链经理',
    new_value: '采购总监',
    applicable: true,
    reason: null,
    status: 'pending',
    ...overrides,
  };
}

export function sampleChatMessage(role: ChatMessage['role'], content: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    message_id: role === 'user' ? '00000000-0000-4000-8000-0000000000b1' : '00000000-0000-4000-8000-0000000000b2',
    role,
    content,
    suggestions: [],
    created_at: '2026-11-10T08:30:00Z',
    ...overrides,
  };
}

/** Response of POST /sessions/{id}/messages with sentinel texts (B-03 checks search for them). */
export function sampleSendMessageResponse(suggestions: Suggestion[] = [sampleSuggestion()]): SendMessageResponse {
  return {
    user_message: sampleChatMessage('user', '哨兵-对话-0001：把岗位改成采购总监'),
    assistant_message: sampleChatMessage('assistant', '哨兵-回复-0001：已为你整理一条修改建议', { suggestions }),
  };
}

export function sampleCreateResumeResponse(overrides: Partial<CreateResumeResponse> = {}): CreateResumeResponse {
  return {
    resume_id: SAMPLE_RESUME_ID,
    already_saved: false,
    saved_at: '2026-11-10T09:00:00Z',
    ...overrides,
  };
}

/**
 * Mimics the backend PATCH semantics for tests: every submitted field gets the submitted value and becomes confirmed;
 * fields that were not submitted keep their value and status.
 */
export function applyPatch(fields: ResumeFields, patch: Record<string, unknown>): ResumeFields {
  const next = structuredClone(fields);
  for (const [key, value] of Object.entries(patch)) {
    (next as unknown as Record<string, { value: unknown; status: string }>)[key] = { value, status: 'confirmed' };
  }
  return next;
}
