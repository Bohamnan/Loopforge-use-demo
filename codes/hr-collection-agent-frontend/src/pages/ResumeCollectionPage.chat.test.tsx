import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { createGate, FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID = '00000000-0000-4000-8000-0000000000b1';
const POST_MESSAGES = `POST /api/v1/sessions/${ID}/messages`;
const GET_SESSION = `GET /api/v1/sessions/${ID}`;
const SENTINEL_IN = '哨兵甲-用户原文-7f3a';
const SENTINEL_OUT = '哨兵乙-助手回复-9c1d';

async function openReviewing(options: FakeBackendOptions = {}) {
  const backend = new FakeBackend({ sessions: [sampleSessionDetail('reviewing', { session_id: ID })], ...options });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
  await screen.findByRole('heading', { name: /基本信息/ });
  return backend;
}
const box = () => screen.getByRole('textbox', { name: '对话输入' });
const sendButton = () => screen.getByRole('button', { name: /发\s?送/ });
async function typeAndSend(text: string) {
  await userEvent.type(box(), text);
  await userEvent.click(sendButton());
}
const posts = (backend: FakeBackend, route: string) => backend.count(route);

describe('chat: main path (REQ-FE-07.1-07.3)', () => {
  it('sends the text, shows both bubbles, clears the input only after success and refreshes the list', async () => {
    const backend = await openReviewing();
    const lists = backend.count('GET /api/v1/sessions');
    await typeAndSend('你好');
    expect(await screen.findByText('好的，已处理。')).toBeInTheDocument();
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(box()).toHaveValue('');
    expect(backend.bodies.find((b) => b.url.endsWith('/messages'))?.body).toEqual({ content: '你好' });
    await waitFor(() => expect(backend.count('GET /api/v1/sessions')).toBe(lists + 1));
  });

  it('shows "思考中" while waiting and ignores a second send meanwhile', async () => {
    const hold = createGate();
    const backend = await openReviewing({ faults: [{ match: POST_MESSAGES, gate: hold.gate }] });
    await userEvent.type(box(), '你好');
    await userEvent.click(sendButton());
    expect(await screen.findByText('思考中…')).toBeInTheDocument();
    expect(box()).toBeDisabled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    hold.open();
    await screen.findByText('好的，已处理。');
    expect(posts(backend, POST_MESSAGES)).toBe(1);
  });

  it('renders message text as plain text, not as HTML', async () => {
    await openReviewing({ reply: () => '<b>粗体</b>' });
    await typeAndSend('你好');
    expect(await screen.findByText('<b>粗体</b>')).toBeInTheDocument();
    expect(document.querySelector('.message b')).toBeNull();
  });

  it('chat_failed keeps the text, shows the backend message and a retry sends again directly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openReviewing({ faults: [{ match: POST_MESSAGES, response: () => errorResponse(502, { code: 'chat_failed', message: '助手暂时无法回复' }) }] });
    await typeAndSend('你好');
    expect(await screen.findByText('助手暂时无法回复')).toBeInTheDocument();
    expect(box()).toHaveValue('你好');
    expect(box()).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    await screen.findByText('好的，已处理。');
    expect(box()).toHaveValue('');
    expect(posts(backend, POST_MESSAGES)).toBe(2);
  });

  it('discard puts the original text back into the input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openReviewing({ faults: [{ match: POST_MESSAGES, response: () => errorResponse(502, { code: 'chat_failed' }) }] });
    await typeAndSend('原文');
    await userEvent.click(await screen.findByRole('button', { name: /放\s?弃/ }));
    expect(box()).toHaveValue('原文');
    expect(box()).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: /重\s?试/ })).not.toBeInTheDocument();
  });

  it('is closed before an upload with a hint', () => {
    stubFetch(new FakeBackend().handle);
    render(<ResumeCollectionPage />);
    expect(box()).toBeDisabled();
    expect(box()).toHaveAttribute('placeholder', '请先上传简历');
  });
});

describe('chat: unknown outcome is checked by re-reading the session (TD-19)', () => {
  it('the lost request had reached the server: retry finds the message, shows it once and does not send again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openReviewing({ faults: [{ match: POST_MESSAGES, afterEffect: true, networkError: true }] });
    await typeAndSend('你好');
    expect(await screen.findByText('无法确认是否已发送')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    await screen.findByText('好的，已处理。');
    expect(posts(backend, POST_MESSAGES)).toBe(1);
    expect(backend.count(GET_SESSION)).toBe(2); // opened + verification
    expect(screen.getAllByText('你好')).toHaveLength(1);
    expect(box()).toHaveValue('');
  });

  it('the lost request never arrived: retry sends the text again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openReviewing({ faults: [{ match: POST_MESSAGES, networkError: true }] });
    await typeAndSend('你好');
    await screen.findByText('无法确认是否已发送');
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    await screen.findByText('好的，已处理。');
    expect(posts(backend, POST_MESSAGES)).toBe(2);
    expect(screen.getAllByText('你好')).toHaveLength(1);
  });
});

describe('red lines of the chat (B-03, F-03, F-02)', () => {
  it('B-03: message text and reply never reach console, document.title or storage on success, failure and timeout paths', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const backend = await openReviewing({
      reply: () => SENTINEL_OUT,
      faults: [
        { match: POST_MESSAGES, response: () => errorResponse(502, { code: 'chat_failed', message: '助手暂时无法回复' }) },
        { match: POST_MESSAGES, afterEffect: true, networkError: true },
      ],
    });
    await typeAndSend(SENTINEL_IN); // chat_failed
    await userEvent.click(await screen.findByRole('button', { name: /重\s?试/ })); // network error after effect
    await screen.findByText('无法确认是否已发送');
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ })); // verified
    await screen.findByText(SENTINEL_OUT);
    const logged = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls)) + document.title;
    expect(logged).not.toContain(SENTINEL_IN);
    expect(logged).not.toContain(SENTINEL_OUT);
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(backend.count(POST_MESSAGES)).toBe(2);
  });

  it('F-03: chatting "确认提交" only shows the reply; no save or update request is made', async () => {
    const backend = await openReviewing();
    await typeAndSend('确认提交，按本次内容更新');
    await screen.findByText('好的，已处理。');
    expect(backend.requests.filter((r) => /\/resume$/.test(r))).toEqual([]);
    expect(screen.queryByText(/已保存|已更新/)).not.toBeInTheDocument();
  });

  it('F-02: the text box is not remembered by the browser', async () => {
    await openReviewing();
    expect(box()).toHaveAttribute('autocomplete', 'off');
  });
});
