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
