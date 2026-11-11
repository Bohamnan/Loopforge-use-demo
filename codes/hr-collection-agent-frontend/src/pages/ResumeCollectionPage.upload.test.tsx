import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, stubFetch } from '../test/ApiMocks';
import { FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pdf = (name = '合成简历.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;
const POST_SESSIONS = 'POST /api/v1/sessions';
const LIST = 'GET /api/v1/sessions';
const READY = () => screen.findByRole('heading', { name: /基本信息/ });

function setup(options: FakeBackendOptions = {}) {
  const backend = new FakeBackend(options);
  const fetchMock = stubFetch(backend.handle);
  const view = render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>,
  );
  return { backend, fetchMock, ...view };
}

describe('upload creates a new session (REQ-FE-01, no overwrite)', () => {
  it('uploads directly, enters the review and sends the file once with same-origin credentials', async () => {
    const { backend, fetchMock, container } = setup();
    await userEvent.upload(fileInput(container), pdf());
    await READY();
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(backend.count(POST_SESSIONS)).toBe(1);
    expect(fetchMock.mock.calls[0]![1].credentials).toBe('same-origin');
  });

  it('a second upload opens another session and does not overwrite the first', async () => {
    const { backend, container } = setup();
    await userEvent.upload(fileInput(container), pdf('第一份.pdf'));
    await READY();
    await userEvent.upload(fileInput(container), pdf('第二份.pdf'));
    await screen.findByText('第二份.pdf');
    expect(backend.sessions.size).toBe(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows one loading notice, disables the inputs and ignores a second file while uploading', async () => {
    const { backend, container } = setup({ faults: [{ match: POST_SESSIONS, delayMs: 50 }] });
    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByText('正在识别，最长约 1 分钟')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(fileInput(container).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /新对话/ })).toBeDisabled();
    fireEvent.drop(document, { dataTransfer: { files: [pdf('另一个.pdf')] } });
    await READY();
    expect(backend.count(POST_SESSIONS)).toBe(1);
  });

  it.each([
    ['unsupported type', new File(['x'], 'a.docx', { type: 'text/plain' }), '仅支持 PDF、JPG、JPEG、PNG 格式。'],
    ['over 10 MB', Object.defineProperty(pdf(), 'size', { value: 10_485_761 }), '文件超过 10 MB，请压缩后重试。'],
  ])('blocks %s before any request', async (_name, file, message) => {
    const { backend, container } = setup();
    fireEvent.change(fileInput(container), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(backend.requests.filter((r) => r !== LIST)).toHaveLength(0);
  });

  it('takes the first of several dropped files and says so', async () => {
    const { backend } = setup();
    fireEvent.drop(document, { dataTransfer: { files: [pdf('第一份.pdf'), pdf('第二份.pdf')] } });
    expect(await screen.findByText('一次只能上传一个文件，已选择第一个。')).toBeInTheDocument();
    await READY();
    expect(backend.bodies.find((b) => b.method === 'POST')?.body).toEqual({ file: '第一份.pdf' });
  });
});

describe('upload errors (REQ-FE-01.4)', () => {
  it.each([
    ['parse_failed', 502, '简历解析失败，请更换文件后重新上传。'],
    ['file_too_large', 413, '文件超过 10 MB，请压缩后重试。'],
  ] as const)('%s shows only the backend message in the composer and keeps the current view', async (code, status, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = setup({ faults: [{ match: POST_SESSIONS, times: 1, response: () => errorResponse(status, { code, message, request_id: 'req_u1' }) }] });
    await userEvent.upload(fileInput(container), pdf());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent('req_u1');
    expect(container.querySelector('.composer-wrap')).toContainElement(alert);
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument(); // still the empty view
    expect(fileInput(container).disabled).toBe(false);
  });

  it('a failed upload leaves the reviewed session on screen (O-02)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = setup();
    await userEvent.upload(fileInput(container), pdf('旧文件.pdf'));
    await READY();
    stubFetch((_url, init) => (init.method === 'POST' ? errorResponse(502, { code: 'parse_failed', message: '简历解析失败，请更换文件后重新上传。' }) : jsonResponse(200, { items: [] })));
    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    expect(await screen.findByText(/简历解析失败/)).toBeInTheDocument();
    expect(screen.getByText('旧文件.pdf')).toBeInTheDocument();
  });

  it('times out after 75 seconds with the re-upload hint and unlocks the composer', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((_url, init) =>
      init.method === 'POST'
        ? (new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))) as unknown as Response)
        : jsonResponse(200, { items: [] }),
    );
    const { container } = render(<ResumeCollectionPage />);
    fireEvent.change(fileInput(container), { target: { files: [pdf()] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(74_999);
    });
    expect(screen.getByText('正在识别，最长约 1 分钟')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('识别时间过长，请重新上传。');
    expect(fileInput(container).disabled).toBe(false);
  });

  it('a 2xx answer of the wrong shape asks the user to reload and check', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((_url, init) => (init.method === 'POST' ? jsonResponse(201, {}) : jsonResponse(200, { items: [] })));
    const { container } = render(<ResumeCollectionPage />);
    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByText('上传结果异常，请刷新页面后核对。')).toBeInTheDocument();
  });

  it('never logs the file name on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((_url, init) => (init.method === 'POST' ? errorResponse(502, { code: 'parse_failed', request_id: 'req_u2' }) : jsonResponse(200, { items: [] })));
    const { container } = render(<ResumeCollectionPage />);
    await userEvent.upload(fileInput(container), pdf('机密文件名.pdf'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(JSON.stringify(spy.mock.calls)).not.toContain('机密文件名');
  });
});
