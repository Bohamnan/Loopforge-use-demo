import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import type { ErrorCode } from '../types/Errors';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pdf = (name = '合成简历.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

function renderPage() {
  return render(
    <StrictMode>
      {/* Motion off: jsdom never fires the transition-end events that remove a closed Modal. */}
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>,
  );
}

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;

/** Router for the two endpoints used by the upload flow. */
function backend(options: { current: () => Response; upload: () => Response | Promise<Response> }) {
  return stubFetch((url, init) =>
    url.endsWith('/resume-drafts/current') && init.method === 'GET'
      ? options.current()
      : (options.upload() as Response),
  );
}

const noDraft = () => errorResponse(404, { code: 'draft_not_found' });
const uploads = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/resume-drafts' && init.method === 'POST');

describe('upload from the empty state (REQ-FE-01)', () => {
  it('uploads directly (no overwrite dialog) and shows the file card on success', async () => {
    const fetchMock = backend({ current: noDraft, upload: () => jsonResponse(201, sampleDraft()) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByText('合成简历.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const calls = uploads(fetchMock);
    expect(calls).toHaveLength(1);
    const body = calls[0]![1].body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(calls[0]![1].credentials).toBe('same-origin');
  });

  it('shows a single loading notice and blocks a second submit while uploading', async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchMock = backend({
      current: noDraft,
      upload: () => new Promise<Response>((resolve) => (release = resolve)) as unknown as Response,
    });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());

    const status = await screen.findByText('正在识别，最长约 1 分钟');
    expect(status).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(fileInput(container).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /新对话/ })).toBeDisabled();

    fireEvent.drop(document, { dataTransfer: { files: [pdf('另一个.pdf')] } });
    expect(uploads(fetchMock)).toHaveLength(1);

    await act(async () => release(jsonResponse(201, sampleDraft())));
    await waitFor(() => expect(screen.queryByText('正在识别，最长约 1 分钟')).not.toBeInTheDocument());
    expect(fileInput(container).disabled).toBe(false);
  });

  it.each([
    ['类型不支持', new File(['x'], 'a.docx', { type: 'text/plain' }), '仅支持 PDF、JPG、JPEG、PNG 格式。'],
    ['空文件', new File([], 'a.pdf', { type: 'application/pdf' }), '文件内容为空，请重新选择。'],
  ])('blocks %s before any request', async (_name, file, message) => {
    const fetchMock = backend({ current: noDraft, upload: () => jsonResponse(201, sampleDraft()) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    fireEvent.change(fileInput(container), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(uploads(fetchMock)).toHaveLength(0);
  });

  it('blocks a file over 10 MB before any request', async () => {
    const fetchMock = backend({ current: noDraft, upload: () => jsonResponse(201, sampleDraft()) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    const big = pdf();
    Object.defineProperty(big, 'size', { value: 10_485_761 });
    fireEvent.change(fileInput(container), { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('文件超过 10 MB，请压缩后重试。');
    expect(uploads(fetchMock)).toHaveLength(0);
  });

  it('takes the first of several dropped files and says so', async () => {
    const fetchMock = backend({ current: noDraft, upload: () => jsonResponse(201, sampleDraft()) });
    renderPage();
    await screen.findByText(/上传简历文件/);
    fireEvent.drop(document, { dataTransfer: { files: [pdf('第一份.pdf'), pdf('第二份.pdf')] } });
    expect(await screen.findByText('一次只能上传一个文件，已选择第一个。')).toBeInTheDocument();
    await waitFor(() => expect(uploads(fetchMock)).toHaveLength(1));
    expect(((uploads(fetchMock)[0]![1].body as FormData).get('file') as File).name).toBe('第一份.pdf');
  });

  it('opens the file picker from the welcome button', async () => {
    backend({ current: noDraft, upload: () => jsonResponse(201, sampleDraft()) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    const click = vi.spyOn(fileInput(container), 'click');
    await userEvent.click(screen.getAllByRole('button', { name: /上传简历/ })[0]!);
    expect(click).toHaveBeenCalled();
  });
});

describe('upload errors (REQ-FE-01.4, 01.6)', () => {
  const cases: [ErrorCode, number, string][] = [
    ['file_missing', 400, '请选择要上传的简历文件。'],
    ['file_empty', 400, '文件内容为空，请重新选择。'],
    ['file_content_mismatch', 400, '文件内容与格式不符，请上传有效的 PDF、JPG 或 PNG 文件。'],
    ['file_too_large', 413, '文件超过 10 MB，请压缩后重试。'],
    ['unsupported_file_type', 415, '仅支持 PDF、JPG、JPEG、PNG 格式。'],
    ['parse_failed', 502, '简历解析失败，请更换文件后重新上传。'],
    ['parse_unavailable', 503, '解析服务暂不可用，请稍后重试。'],
    ['parse_timeout', 504, '解析超时，请重新上传。'],
  ];

  it.each(cases)('%s shows only the backend message', async (code, status, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({ current: noDraft, upload: () => errorResponse(status, { code, message, request_id: 'req_u1' }) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent('req_u1');
    expect(fileInput(container).disabled).toBe(false);
  });

  it('times out after 75 seconds with the re-upload hint and unlocks the composer', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((url, init) =>
      url.endsWith('/current')
        ? noDraft()
        : (new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))) as unknown as Response),
    );
    const { container } = renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.change(fileInput(container), { target: { files: [pdf()] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(74_999);
    });
    expect(screen.getByText('正在识别，最长约 1 分钟')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('识别时间过长，请重新上传。');
    expect(screen.queryByText('正在识别，最长约 1 分钟')).not.toBeInTheDocument();
    expect(fileInput(container).disabled).toBe(false);
  });

  it('treats a timeout while reading the response body as a timeout too (review SUGGEST-1)', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(
      (url, init) =>
        (url.endsWith('/current')
          ? noDraft()
          : ({
              ok: true,
              status: 201,
              json: () => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))),
            } as unknown as Response)),
    );
    const { container } = renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.change(fileInput(container), { target: { files: [pdf()] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('识别时间过长，请重新上传。');
  });

  it('never logs the file name or content on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({ current: noDraft, upload: () => errorResponse(502, { code: 'parse_failed', request_id: 'req_u2' }) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf('机密文件名.pdf'));
    await screen.findByRole('alert');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('机密文件名');
  });
});

describe('re-upload over an existing draft (REQ-FE-01.5)', () => {
  const withDraft = (upload: () => Response | Promise<Response>) => backend({ current: () => jsonResponse(200, sampleDraft()), upload });

  it('asks for confirmation first; cancelling sends nothing and keeps the draft', async () => {
    const fetchMock = withDraft(() => jsonResponse(201, sampleDraft()));
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/将用新文件覆盖/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /取\s?消/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(uploads(fetchMock)).toHaveLength(0);
    expect(screen.getByText('已为你恢复未完成的简历')).toBeInTheDocument();
  });

  it('uploads only after the user confirms the overwrite', async () => {
    const next = sampleDraft({ original_file: { filename: '新文件.pdf', content_type: 'application/pdf', size_bytes: 10 } });
    const fetchMock = withDraft(() => jsonResponse(201, next));
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    const dialog = await screen.findByRole('dialog');
    expect(uploads(fetchMock)).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: '继续上传' }));
    expect(await screen.findByText('新文件.pdf')).toBeInTheDocument();
    expect(uploads(fetchMock)).toHaveLength(1);
    expect(screen.queryByText('已为你恢复未完成的简历')).not.toBeInTheDocument();
  });

  it('keeps the old draft on screen when the confirmed upload fails (O-02)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    withDraft(() => errorResponse(502, { code: 'parse_failed', message: '简历解析失败，请更换文件后重新上传。' }));
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续上传' }));
    expect(await screen.findByText(/简历解析失败/)).toBeInTheDocument();
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
    expect(screen.getByText('已为你恢复未完成的简历')).toBeInTheDocument();
  });
});

describe('upload error placement (integration drill SUGGEST-1)', () => {
  it('shows the error in the fixed composer area, not at the end of the long review list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({
      current: () => jsonResponse(200, sampleDraft()),
      upload: () => errorResponse(415, { code: 'unsupported_file_type', message: '仅支持 PDF、JPG、JPEG、PNG 格式。' }),
    });
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续上传' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('仅支持 PDF、JPG、JPEG、PNG 格式。');
    expect(container.querySelector('.composer-wrap')).toContainElement(alert);
    expect(container.querySelector('.chat-thread')).not.toContainElement(alert);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows the error in the composer in the empty state too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({ current: noDraft, upload: () => errorResponse(502, { code: 'parse_failed', message: '简历解析失败，请更换文件后重新上传。' }) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());
    expect(container.querySelector('.composer-wrap')).toContainElement(await screen.findByRole('alert'));
  });
});

describe('upload answered 2xx with a wrong shape (review batch 5 S3)', () => {
  it('tells the user to reload and check, and does not present the old draft as current without a hint', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({ current: () => jsonResponse(200, sampleDraft()), upload: () => jsonResponse(201, {}) });
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续上传' }));
    expect(await screen.findByText('上传结果异常，请刷新页面后核对。')).toBeInTheDocument();
    expect(fileInput(container).disabled).toBe(false);
  });

  it('a normal unknown error (bad gateway) keeps the generic wording', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend({ current: noDraft, upload: () => new Response('<html>bad</html>', { status: 502 }) });
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用');
    expect(screen.queryByText('上传结果异常，请刷新页面后核对。')).not.toBeInTheDocument();
  });
});
