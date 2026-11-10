import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <StrictMode>
      <ResumeCollectionPage />
    </StrictMode>,
  );
}

describe('ResumeCollectionPage bootstrap (REQ-FE-05)', () => {
  it('shows a loading state while reading the draft', async () => {
    stubFetch(() => new Promise<Response>(() => undefined) as unknown as Response);
    renderPage();
    expect(await screen.findByText('正在读取草稿…')).toBeInTheDocument();
  });

  it('GET 404 shows the empty state with no error and no console output (O-12)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(404, { code: 'draft_not_found' }));
    renderPage();
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it.each([
    ['500 internal_error', () => errorResponse(500, { code: 'internal_error' })],
    ['non-JSON 502', () => new Response('<html>bad</html>', { status: 502 })],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')) as unknown as Response],
  ])('GET %s shows a retryable error state, not the empty state', async (_name, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(response);
    renderPage();
    expect(await screen.findByRole('button', { name: /重\s?试/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/上传简历文件/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上传简历/ })).not.toBeInTheDocument();
  });

  it('retry calls the API again and recovers into the empty state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const fetchMock = stubFetch(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, { code: 'internal_error' }) : errorResponse(404, { code: 'draft_not_found' });
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /重\s?试/ }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET 200 leaves the loading state and shows the restored notice', async () => {
    stubFetch(() => jsonResponse(200, sampleDraft()));
    renderPage();
    expect(await screen.findByText('已为你恢复未完成的简历')).toBeInTheDocument();
    expect(screen.queryByText('正在读取草稿…')).not.toBeInTheDocument();
  });

  it('sends exactly one GET with same-origin credentials, even under StrictMode', async () => {
    const fetchMock = stubFetch(() => errorResponse(404, { code: 'draft_not_found' }));
    renderPage();
    await waitFor(() => expect(screen.queryByText('正在读取草稿…')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/resume-drafts/current');
    expect(init.credentials).toBe('same-origin');
  });

  it('shows no user info, history, guide, privacy or sample-file entries', async () => {
    stubFetch(() => errorResponse(404, { code: 'draft_not_found' }));
    renderPage();
    await screen.findByText(/上传简历文件/);
    expect(screen.queryByText(/历史|填写指南|隐私说明|示例文件/)).not.toBeInTheDocument();
  });
});
