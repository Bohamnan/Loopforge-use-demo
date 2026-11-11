import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleArchivedResume, stubFetch } from '../test/ApiMocks';
import { downloadResumeFile, getResume, listResumes } from './ArchiveApi';

afterEach(() => vi.unstubAllGlobals());

describe('ArchiveApi', () => {
  it('lists and reads archived resumes', async () => {
    const fetchMock = stubFetch((url) => (url.endsWith('/resumes') ? jsonResponse(200, { items: [] }) : jsonResponse(200, sampleArchivedResume())));
    expect((await listResumes()).items).toEqual([]);
    expect((await getResume('r 1')).file_available).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/resumes', '/api/v1/resumes/r%201']);
  });

  it('downloads the file as a Blob and maps file_not_available', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    expect(await downloadResumeFile('r1')).toBeInstanceOf(Blob);
    stubFetch(() => errorResponse(404, { code: 'file_not_available' }));
    await expect(downloadResumeFile('r1')).rejects.toMatchObject({ code: 'file_not_available' });
  });
});
