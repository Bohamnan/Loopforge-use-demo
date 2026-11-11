import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './ApiError';
import { CHAT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, request } from './ApiClient';
import { errorResponse, jsonResponse, stubFetch, stubHangingFetch } from '../test/ApiMocks';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ApiClient.request', () => {
  it('prefixes /api/v1, uses same-origin credentials and parses JSON', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, { ok: true }));
    const result = await request<{ ok: boolean }>('/sessions/s1', { method: 'GET' });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/sessions/s1');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('sends JSON bodies with a JSON Content-Type', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, {}));
    await request('/sessions/s1/resume', { method: 'POST', body: { confirmed: true } });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBe('{"confirmed":true}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('sends FormData without setting Content-Type', async () => {
    const fetchMock = stubFetch(() => jsonResponse(201, {}));
    const form = new FormData();
    form.append('file', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await request('/sessions', { method: 'POST', body: form });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('parses a backend error body into ApiError with details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() =>
      errorResponse(422, {
        code: 'validation_failed',
        message: '字段校验失败',
        request_id: 'req_9',
        details: [{ field: 'phone', reason: 'invalid_format' }],
      }),
    );
    const error = await request('/x', { method: 'PATCH', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', request_id: 'req_9' });
  });

  it.each([413, 502, 504])('turns a non-JSON %i response into unknown_error without exposing the body', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => new Response('<html>gateway 测试用户甲</html>', { status }));
    const error = (await request('/x', { method: 'GET' }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('unknown_error');
    expect(error.status).toBe(status);
    expect(error.message).not.toContain('gateway');
  });

  it('turns an invalid JSON success body into unknown_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => new Response('not json', { status: 200 }));
    const error = (await request('/x', { method: 'GET' }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('unknown_error');
  });

  it('maps a rejected fetch to network_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')) as unknown as Response);
    const error = (await request('/x', { method: 'GET' }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('network_error');
  });

  it('aborts after the default 30s timeout with client_timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubHangingFetch();
    const pending = request('/x', { method: 'GET' }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });

  it('honours a custom 75s upload timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubHangingFetch();
    const pending = request('/x', { method: 'POST', timeoutMs: UPLOAD_TIMEOUT_MS }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });

  it('maps a timeout during response body reading to client_timeout, not unknown_error (review SUGGEST-1)', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Headers arrive at once, but the body never completes until the request is aborted.
    stubFetch(
      (_url, init) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }),
        }) as unknown as Response,
    );
    const pending = request('/x', { method: 'GET' }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });

  it('also reports client_timeout when an error response body hangs', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(
      (_url, init) =>
        ({
          ok: false,
          status: 502,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }),
        }) as unknown as Response,
    );
    const pending = request('/x', { method: 'POST', timeoutMs: UPLOAD_TIMEOUT_MS }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });

  it('rejects a 2xx body that fails the given shape check as unknown_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => jsonResponse(200, { unexpected: true }));
    const isOk = (value: unknown): value is { ok: boolean } => typeof value === 'object' && value !== null && 'ok' in value;
    const error = (await request('/x', { method: 'GET', validate: isOk }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('unknown_error');
    expect(error.status).toBe(200);
    stubFetch(() => jsonResponse(200, { ok: true }));
    await expect(request('/x', { method: 'GET', validate: isOk })).resolves.toEqual({ ok: true });
  });

  it('exposes the contract timeouts', () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(75_000);
    expect(CHAT_TIMEOUT_MS).toBe(75_000);
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it('logs only request_id, code and status on failure, never bodies', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(500, { code: 'internal_error', message: '内部错误 测试用户甲', request_id: 'req_7' }));
    await request('/x', { method: 'POST', body: { fields: { name: '测试用户甲' } } }).catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain('req_7');
    expect(logged).toContain('internal_error');
    expect(logged).toContain('500');
    expect(logged).not.toContain('测试用户甲');
  });

  it('does not log for codes listed as quiet', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(404, { code: 'session_not_found' }));
    const error = (await request('/x', { method: 'DELETE', quietCodes: ['session_not_found'] }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('session_not_found');
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends PUT and DELETE with the given method', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, {}));
    await request('/sessions/s1/resume', { method: 'PUT', body: { confirm_update: true } });
    expect(fetchMock.mock.calls[0]![1].method).toBe('PUT');
  });

  describe('responseMode none (expects 204)', () => {
    it('resolves on 204 and fails on any other 2xx', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => new Response(null, { status: 204 }));
      await expect(request('/x', { method: 'DELETE', responseMode: 'none' })).resolves.toBeUndefined();
      stubFetch(() => jsonResponse(200, {}));
      const error = (await request('/x', { method: 'DELETE', responseMode: 'none' }).catch((e: unknown) => e)) as ApiError;
      expect(error.code).toBe('unknown_error');
    });

    it('parses a JSON error body', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => errorResponse(404, { code: 'session_not_found' }));
      const error = (await request('/x', { method: 'DELETE', responseMode: 'none' }).catch((e: unknown) => e)) as ApiError;
      expect(error.code).toBe('session_not_found');
    });
  });

  describe('responseMode blob', () => {
    it('returns the bytes for pdf / jpeg / png and rejects other content types', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf; charset=binary' } }));
      const blob = await request<Blob>('/x', { method: 'GET', responseMode: 'blob' });
      expect(blob).toBeInstanceOf(Blob);
      stubFetch(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
      const error = (await request('/x', { method: 'GET', responseMode: 'blob' }).catch((e: unknown) => e)) as ApiError;
      expect(error.code).toBe('unknown_error');
    });

    it('still parses a JSON error body', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => errorResponse(404, { code: 'file_not_available' }));
      const error = (await request('/x', { method: 'GET', responseMode: 'blob' }).catch((e: unknown) => e)) as ApiError;
      expect(error.code).toBe('file_not_available');
    });
  });

  it('honours the 75s chat timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubHangingFetch();
    const pending = request('/x', { method: 'POST', timeoutMs: CHAT_TIMEOUT_MS }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(CHAT_TIMEOUT_MS);
    expect(((await pending) as ApiError).code).toBe('client_timeout');
  });
});
