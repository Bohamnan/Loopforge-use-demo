import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResumeDraft, getCurrentResumeDraft, updateCurrentResumeDraft } from './ResumeDraftApi';
import { ApiError } from './ApiError';
import { errorResponse, jsonResponse, sampleDraft, stubFetch, stubHangingFetch } from '../test/ApiMocks';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createResumeDraft', () => {
  it('posts the file as multipart field "file" and returns the draft', async () => {
    const draft = sampleDraft();
    const fetchMock = stubFetch(() => jsonResponse(201, draft));
    const file = new File(['%PDF'], '合成简历.pdf', { type: 'application/pdf' });
    await expect(createResumeDraft(file)).resolves.toEqual(draft);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/resume-drafts');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.credentials).toBe('same-origin');
  });

  it('uses the 75s upload timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubHangingFetch();
    const pending = createResumeDraft(new File(['x'], 'a.pdf')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(74_999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });

  it('surfaces upload errors as ApiError with the backend message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(413, { code: 'file_too_large', message: '文件超过 10 MB，请压缩后重试。' }));
    const error = (await createResumeDraft(new File(['x'], 'a.pdf')).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ code: 'file_too_large', message: '文件超过 10 MB，请压缩后重试。' });
  });
});

describe('getCurrentResumeDraft', () => {
  it('returns the draft on 200', async () => {
    const draft = sampleDraft();
    const fetchMock = stubFetch(() => jsonResponse(200, draft));
    await expect(getCurrentResumeDraft()).resolves.toEqual(draft);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/resume-drafts/current');
    expect(fetchMock.mock.calls[0]![1].method).toBe('GET');
  });

  it('returns null on 404 draft_not_found without throwing or logging (O-12)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(404, { code: 'draft_not_found' }));
    await expect(getCurrentResumeDraft()).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ['500 internal_error', () => errorResponse(500, { code: 'internal_error' }), 'internal_error'],
    ['non-JSON 502', () => new Response('bad gateway', { status: 502 }), 'unknown_error'],
  ])('still throws for other failures (%s)', async (_name, response, code) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(response);
    const error = (await getCurrentResumeDraft().catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(code);
  });

  it('uses the 30s timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubHangingFetch();
    const pending = getCurrentResumeDraft().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });
});

describe('updateCurrentResumeDraft', () => {
  it('patches {fields} and returns the replaced draft', async () => {
    const draft = sampleDraft();
    const fetchMock = stubFetch(() => jsonResponse(200, draft));
    await expect(updateCurrentResumeDraft({ phone: '13800138000', skills: [] })).resolves.toEqual(draft);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/resume-drafts/current');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ fields: { phone: '13800138000', skills: [] } });
  });

  it('throws draft_not_found as ApiError (not null) for PATCH', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(404, { code: 'draft_not_found' }));
    const error = (await updateCurrentResumeDraft({}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('draft_not_found');
  });

  it('keeps 422 details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() =>
      errorResponse(422, { code: 'validation_failed', details: [{ field: 'work_experiences[0].start_date', reason: 'too_long' }] }),
    );
    const error = (await updateCurrentResumeDraft({}).catch((e: unknown) => e)) as ApiError;
    expect(error.details).toEqual([{ field: 'work_experiences[0].start_date', reason: 'too_long' }]);
  });
});
