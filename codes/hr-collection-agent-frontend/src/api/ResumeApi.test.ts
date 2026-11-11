import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleCreateResumeResponse, stubFetch } from '../test/ApiMocks';
import { createResume, updateResume } from './ResumeApi';

afterEach(() => vi.unstubAllGlobals());

describe('ResumeApi', () => {
  it('createResume posts the constant body {confirmed:true} to the session path', async () => {
    const fetchMock = stubFetch(() => jsonResponse(201, sampleCreateResumeResponse()));
    expect((await createResume('s1')).already_saved).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method, init.body]).toEqual(['/api/v1/sessions/s1/resume', 'POST', '{"confirmed":true}']);
  });

  it('createResume accepts 200 already_saved and rejects a wrong 2xx shape (F-03)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => jsonResponse(200, sampleCreateResumeResponse({ already_saved: true })));
    expect((await createResume('s1')).already_saved).toBe(true);
    stubFetch(() => jsonResponse(200, { ok: true }));
    await expect(createResume('s1')).rejects.toMatchObject({ code: 'unknown_error' });
  });

  it('updateResume puts the constant body {confirm_update:true}', async () => {
    const fetchMock = stubFetch(() => jsonResponse(200, { resume_id: 'r1', updated_at: '2026-11-10T10:00:00Z' }));
    await updateResume('s1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method, init.body]).toEqual(['/api/v1/sessions/s1/resume', 'PUT', '{"confirm_update":true}']);
  });

  it('updateResume maps save_failed and rejects a wrong 2xx shape (F-03)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(500, { code: 'save_failed' }));
    await expect(updateResume('s1')).rejects.toMatchObject({ code: 'save_failed' });
    stubFetch(() => jsonResponse(200, {}));
    await expect(updateResume('s1')).rejects.toMatchObject({ code: 'unknown_error' });
  });
});
