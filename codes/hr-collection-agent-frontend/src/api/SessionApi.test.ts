import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleSessionDetail, sampleSessionSummary, stubFetch } from '../test/ApiMocks';
import { ApiError } from './ApiError';
import { createSession, deleteSession, getSession, listSessions, updateSessionFields } from './SessionApi';

afterEach(() => vi.unstubAllGlobals());

describe('SessionApi', () => {
  it('createSession posts multipart field "file" without a Content-Type header', async () => {
    const fetchMock = stubFetch(() => jsonResponse(201, sampleSessionDetail('reviewing')));
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const detail = await createSession(file);
    expect(detail.status).toBe('reviewing');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method, init.credentials]).toEqual(['/api/v1/sessions', 'POST', 'same-origin']);
    expect((init.body as FormData).get('file')).toBe(file);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('createSession surfaces a backend error (parse_failed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(422, { code: 'parse_failed' }));
    await expect(createSession(new File(['x'], 'a.pdf'))).rejects.toMatchObject({ code: 'parse_failed' });
  });

  it('listSessions and getSession read; a wrong 2xx shape is unknown_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = stubFetch(() => jsonResponse(200, { items: [sampleSessionSummary()] }));
    expect((await listSessions()).items).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/sessions');
    stubFetch(() => jsonResponse(200, { session_id: 's1' }));
    await expect(getSession('s1')).rejects.toMatchObject({ code: 'unknown_error' });
  });

  it('encodes the path parameter', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, sampleSessionDetail('saved')));
    await getSession('a/b?c');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/sessions/a%2Fb%3Fc');
  });

  it('deleteSession sends DELETE and treats 404 session_not_found as success without logging', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await expect(deleteSession('s1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
    stubFetch(() => errorResponse(404, { code: 'session_not_found' }));
    await expect(deleteSession('s1')).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    stubFetch(() => errorResponse(500, { code: 'internal_error' }));
    await expect(deleteSession('s1')).rejects.toBeInstanceOf(ApiError);
  });

  it('updateSessionFields patches {fields}', async () => {
    const fields = sampleSessionDetail('reviewing').fields;
    const fetchMock = stubFetch(() => jsonResponse(200, { session_id: 's1', fields, updated_at: '2026-11-10T09:00:00Z' }));
    await updateSessionFields('s1', { job_title: '总监' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method, init.body]).toEqual(['/api/v1/sessions/s1/fields', 'PATCH', '{"fields":{"job_title":"总监"}}']);
  });
});
