import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResume } from './ResumeApi';
import { ApiError } from './ApiError';
import { errorResponse, jsonResponse, sampleCreateResumeResponse, stubFetch, stubHangingFetch } from '../test/ApiMocks';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createResume', () => {
  it('posts exactly {confirmed: true} once', async () => {
    const fetchMock = stubFetch(() => jsonResponse(201, sampleCreateResumeResponse()));
    await createResume();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/resumes');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"confirmed":true}');
  });

  it('returns already_saved=false for 201 and already_saved=true for 200', async () => {
    stubFetch(() => jsonResponse(201, sampleCreateResumeResponse({ already_saved: false })));
    expect((await createResume()).already_saved).toBe(false);
    stubFetch(() => jsonResponse(200, sampleCreateResumeResponse({ already_saved: true })));
    expect((await createResume()).already_saved).toBe(true);
  });

  it.each(['draft_not_found', 'validation_failed', 'save_failed', 'confirmation_required'] as const)(
    'throws %s as ApiError',
    async (code) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => errorResponse(code === 'draft_not_found' ? 404 : 422, { code }));
      const error = (await createResume().catch((e: unknown) => e)) as ApiError;
      expect(error.code).toBe(code);
    },
  );

  describe('a 2xx response with the wrong shape is never a success (F-03)', () => {
    it.each([
      ['200 {}', 200, {}],
      ['201 {}', 201, {}],
      ['200 null', 200, null],
      ['200 []', 200, []],
      ['missing already_saved', 201, { resume_id: 'r1', saved_at: '2026-11-10T09:00:00Z' }],
      ['already_saved not a boolean', 201, { resume_id: 'r1', already_saved: 'false', saved_at: '2026-11-10T09:00:00Z' }],
      ['empty resume_id', 201, { resume_id: '', already_saved: false, saved_at: '2026-11-10T09:00:00Z' }],
      ['missing saved_at', 201, { resume_id: 'r1', already_saved: false }],
    ])('%s -> unknown_error', async (_name, status, payload) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => jsonResponse(status, payload));
      const error = (await createResume().catch((e: unknown) => e)) as ApiError;
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('unknown_error');
      expect(error.status).toBe(status);
      expect(JSON.stringify(spy.mock.calls)).not.toContain('r1');
    });
  });

  it('times out after 30s and does not retry', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = stubHangingFetch();
    const pending = createResume().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
