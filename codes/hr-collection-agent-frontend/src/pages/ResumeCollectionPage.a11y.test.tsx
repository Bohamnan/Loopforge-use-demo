import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { errorResponse, sampleSessionDetail, sampleSuggestion, stubFetch } from '../test/ApiMocks';
import { createGate, FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import { RESUME_FIELD_KEYS, type ResumeFields } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  // @ts-expect-error restore the jsdom default
  delete Element.prototype.scrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID = sampleSessionDetail().session_id;
const focused = () => document.activeElement as HTMLElement | null;

function setup(options: FakeBackendOptions = {}) {
  const backend = new FakeBackend({ sessions: [sampleSessionDetail('reviewing')], ...options });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  return backend;
}
/** Opens the session from the list with the keyboard only. */
async function openByKeyboard() {
  const item = await screen.findByRole('button', { name: /^简历 · 测试用户甲/ });
  item.focus();
  await userEvent.keyboard('{Enter}');
  await screen.findByRole('heading', { name: /基本信息/ });
}

describe('focus management (TD-13, TD-31)', () => {
  it('focuses the first section to review when a session opens, then the next one after confirming', async () => {
    setup();
    await openByKeyboard();
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'section:basic'));
    await userEvent.click(screen.getByRole('button', { name: /确认本区/ }));
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'section:intent'));
  });

  it('a new chat message gets the focus', async () => {
    setup();
    await openByKeyboard();
    await userEvent.type(screen.getByRole('textbox', { name: '对话输入' }), '你好{Enter}');
    await screen.findByText('好的，已处理。');
    await waitFor(() => expect(focused()).toHaveTextContent('好的，已处理。'));
  });

  it('final review, then the saved result get the focus; the confirmation works with the keyboard alone', async () => {
    const fields = sampleSessionDetail().fields as ResumeFields;
    for (const key of RESUME_FIELD_KEYS) fields[key].status = 'confirmed';
    setup({ sessions: [sampleSessionDetail('reviewing', { fields })] });
    await openByKeyboard();
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'final'));
    screen.getByRole('button', { name: /确认提交/ }).focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByTestId('saved-result');
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'saved'));
  });

  it('the opened diff card gets the focus', async () => {
    const pending = sampleSessionDetail('pending');
    setup({ sessions: [pending], resumes: [pending.resume!] });
    const item = await screen.findByRole('button', { name: /^简历 · 测试用户甲/ });
    item.focus();
    await userEvent.keyboard('{Enter}');
    const quick = await screen.findByRole('button', { name: '按本次内容更新' });
    quick.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'update-diff'));
    expect(within(focused() as HTMLElement).getByRole('button', { name: /确认更新/ })).toBeInTheDocument();
  });
});

describe('announcements (TD-13)', () => {
  it('"思考中" is announced politely and a chat error as exactly one alert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hold = createGate();
    setup({ faults: [{ match: `POST /api/v1/sessions/${ID}/messages`, gate: hold.gate, response: () => errorResponse(502, { code: 'chat_failed', message: '助手暂时无法回复' }) }] });
    await openByKeyboard();
    await userEvent.type(screen.getByRole('textbox', { name: '对话输入' }), '你好{Enter}');
    expect(await screen.findByText('思考中…')).toBeInTheDocument();
    expect(screen.getByText('思考中…').closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    hold.open();
    await screen.findByText('助手暂时无法回复');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('keyboard reachability of the v2 controls (TD-13)', () => {
  it('send, apply, delete and the page switch work from the keyboard', async () => {
    const backend = new FakeBackend({ sessions: [sampleSessionDetail('reviewing')], suggest: () => [sampleSuggestion()] });
    stubFetch(backend.handle);
    render(<App />);
    await openByKeyboard();
    const box = screen.getByRole('textbox', { name: '对话输入' });
    await userEvent.type(box, '岗位改成采购总监');
    screen.getByRole('button', { name: /发\s?送/ }).focus();
    await userEvent.keyboard('{Enter}');
    const apply = await within(await screen.findByLabelText('修改建议')).findByRole('button', { name: /^应\s?用$/ });
    apply.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('已应用 ✓')).toBeInTheDocument();
    screen.getByRole('button', { name: '删除会话 简历 · 测试用户甲' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toHaveTextContent('删除会话');
    await userEvent.keyboard('{Escape}');
    const archive = screen.getAllByRole('radio', { name: '已归档简历' })[0]!;
    archive.focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(backend.count('GET /api/v1/resumes')).toBe(1));
  });

  it('every visible input has a programmatic label', async () => {
    setup();
    await openByKeyboard();
    const inputs = Array.from(document.querySelectorAll('input:not([type="file"]):not([type="radio"]), textarea')).filter(
      (el) => el.getAttribute('aria-hidden') !== 'true',
    ) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const el of inputs) {
      const labelled = el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
      expect(labelled).toBeTruthy();
    }
  });
});
