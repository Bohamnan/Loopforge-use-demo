import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const REVIEWING_ID = '00000000-0000-4000-8000-0000000000a1';
const SAVED_ID = '00000000-0000-4000-8000-0000000000a2';
const reviewing = () => sampleSessionDetail('reviewing', { session_id: REVIEWING_ID, name: '简历 · 甲', last_active_at: '2026-11-10T09:00:00Z' });
const saved = () => sampleSessionDetail('saved', { session_id: SAVED_ID, name: '简历 · 乙', last_active_at: '2026-11-10T08:00:00Z' });
const LIST = 'GET /api/v1/sessions';

function setup(options: FakeBackendOptions = { sessions: [reviewing(), saved()] }) {
  const backend = new FakeBackend(options);
  stubFetch(backend.handle);
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  return { backend, ...view };
}
const item = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('session list (REQ-FE-05.1, 05.2, 05.6)', () => {
  it('lists sessions with status words and does not open any of them', async () => {
    setup();
    expect(await screen.findByText('简历 · 甲')).toBeInTheDocument();
    expect(screen.getByText('校对中')).toBeInTheDocument();
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('a failed list load only shows an error in the list area; retry recovers; upload still works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { backend, container } = setup({ sessions: [reviewing()], faults: [{ match: LIST, response: () => errorResponse(500, { code: 'internal_error', message: '服务内部错误' }) }] });
    expect(await screen.findByText('服务内部错误')).toBeInTheDocument();
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    expect(await screen.findByText('简历 · 甲')).toBeInTheDocument();
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], '合成简历.pdf', { type: 'application/pdf' }));
    await screen.findByRole('heading', { name: /基本信息/ });
    await waitFor(() => expect(backend.count(LIST)).toBeGreaterThan(2)); // upload refreshed the list (TD-30)
  });
});

describe('switching and leaving (REQ-FE-05.3, 05.4)', () => {
  it('opens a reviewing and then a saved session without side effects on each other', async () => {
    const { backend } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 甲/ }));
    await screen.findByRole('heading', { name: /基本信息/ });
    expect(item('简历 · 甲')).toHaveAttribute('aria-current', 'true');
    await userEvent.click(item('简历 · 乙'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /基本信息/ })).not.toBeInTheDocument());
    expect(backend.requests.filter((r) => r !== LIST).every((r) => r.startsWith('GET '))).toBe(true);
  });

  it('with unsubmitted edits asks first: cancel keeps the view, continue opens the other session', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 甲/ }));
    await screen.findByRole('heading', { name: /基本信息/ });
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '改过的名字' } });
    await userEvent.click(item('简历 · 乙'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /返\s?回/ }));
    expect(screen.getByLabelText('姓名')).toHaveValue('改过的名字');
    await userEvent.click(item('简历 · 乙'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '放弃修改并继续' }));
    await waitFor(() => expect(screen.queryByLabelText('姓名')).not.toBeInTheDocument());
  });

  it('a session that no longer exists returns to the empty view with a notice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setup({ sessions: [reviewing()], faults: [{ match: `GET /api/v1/sessions/${REVIEWING_ID}`, response: () => errorResponse(404, { code: 'session_not_found' }) }] });
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 甲/ }));
    expect(await screen.findByText('该会话已不存在')).toBeInTheDocument();
  });
});

describe('delete (REQ-FE-05.5)', () => {
  it('reviewing: confirmation says information and file are deleted; deleting the current session returns to the empty view', async () => {
    const { backend } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 甲/ }));
    await screen.findByRole('heading', { name: /基本信息/ });
    await userEvent.click(screen.getByRole('button', { name: '删除会话 简历 · 甲' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('信息与已上传文件将一并删除，且无法恢复');
    await userEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /基本信息/ })).not.toBeInTheDocument());
    expect(backend.sessions.has(REVIEWING_ID)).toBe(false);
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('saved: confirmation says only the chat record is deleted; cancel sends nothing', async () => {
    const { backend } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '删除会话 简历 · 乙' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('只删除这个会话的对话记录');
    await userEvent.click(within(dialog).getByRole('button', { name: /取\s?消/ }));
    expect(backend.requests.some((r) => r.startsWith('DELETE'))).toBe(false);
  });
});

describe('narrow screens (TD-26)', () => {
  it('reaches the session list through the "会话" drawer and closes it after selecting', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 859px'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: globalThis.matchMedia });
    setup();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: /^会\s?话$/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 甲/ }));
    expect(await screen.findByRole('heading', { name: /基本信息/ })).toBeInTheDocument();
  });
});
