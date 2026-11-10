import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleCreateResumeResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function page() {
  return (
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>
  );
}

const newChat = () => screen.getByRole('button', { name: /新对话/ });
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = () => new File(['%PDF'], '新文件.pdf', { type: 'application/pdf' });

function backend(draft: ReturnType<typeof sampleDraft> | null) {
  return stubFetch((url) => {
    if (url.endsWith('/current')) return draft ? jsonResponse(200, draft) : errorResponse(404, { code: 'draft_not_found' });
    if (url === '/api/v1/resumes') return jsonResponse(201, sampleCreateResumeResponse());
    return jsonResponse(201, sampleDraft({ original_file: { filename: '新文件.pdf', content_type: 'application/pdf', size_bytes: 4 } }));
  });
}
const calls = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls.map(([url, init]) => `${init.method} ${url}`);

describe('new chat (P-08, TD-12)', () => {
  it('clears at once, without a dialog, when there is no draft', async () => {
    const mock = backend(null);
    render(page());
    await screen.findByText(/上传简历文件/);
    await userEvent.click(newChat());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
    expect(calls(mock)).toEqual(['GET /api/v1/resume-drafts/current']);
  });

  it('asks first when an unconfirmed draft is on screen, and says what stays on the server', async () => {
    backend(sampleDraft());
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(newChat());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/刷新页面会恢复/)).toBeInTheDocument();
    expect(within(dialog).getByText(/再次上传.*覆盖/)).toBeInTheDocument();
  });

  it('cancelling keeps the draft and the unsubmitted edits', async () => {
    backend(sampleDraft());
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.type(screen.getByLabelText('个人主页'), 'x');
    await userEvent.click(newChat());
    expect(within(await screen.findByRole('dialog')).getByText(/未提交的修改将丢失/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /取\s?消/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('个人主页')).toHaveValue('x');
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
  });

  it('confirming clears the screen and calls no API (there is no discard endpoint)', async () => {
    const mock = backend(sampleDraft());
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(newChat());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '清空并开始' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expect(screen.queryByText('合成简历.pdf')).not.toBeInTheDocument();
    expect(calls(mock)).toEqual(['GET /api/v1/resume-drafts/current']);
  });

  it('the next upload overwrites the old draft without asking a second time', async () => {
    const mock = backend(sampleDraft());
    const { container } = render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(newChat());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '清空并开始' }));
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByText('新文件.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls(mock)).toEqual(['GET /api/v1/resume-drafts/current', 'POST /api/v1/resume-drafts']);
  });

  it('after a reload the old draft is restored again (known behaviour)', async () => {
    backend(sampleDraft());
    const first = render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(newChat());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '清空并开始' }));
    await screen.findByText(/上传简历文件/);
    first.unmount();
    render(page());
    expect(await screen.findByText('已为你恢复未完成的简历')).toBeInTheDocument();
  });

  it('also asks on the final review screen', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    backend(draft);
    render(page());
    await screen.findByRole('button', { name: /确认提交/ });
    await userEvent.click(newChat());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('from the result screen clears at once, and the old result is gone', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    backend(draft);
    render(page());
    await userEvent.click(await screen.findByRole('button', { name: /确认提交/ }));
    await screen.findByTestId('saved-result');
    await userEvent.click(newChat());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
  });

  it('is locked while a request is running', async () => {
    let release: (r: Response) => void = () => undefined;
    stubFetch((url) => (url.endsWith('/current') ? errorResponse(404, { code: 'draft_not_found' }) : (new Promise<Response>((r) => (release = r)) as unknown as Response)));
    const { container } = render(page());
    await screen.findByText(/上传简历文件/);
    fireEvent.change(fileInput(container), { target: { files: [pdf()] } });
    expect(newChat()).toBeDisabled();
    fireEvent.click(newChat());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    release(jsonResponse(201, sampleDraft()));
  });
});
