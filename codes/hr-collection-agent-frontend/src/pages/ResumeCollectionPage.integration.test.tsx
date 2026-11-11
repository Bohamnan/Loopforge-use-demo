import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import App from '../App';
import { sampleSuggestion, stubFetch } from '../test/ApiMocks';
import { FakeBackend } from '../test/FakeBackend';

// Session-model integration (task 3.1). Synthetic data only (B-06). Each sentinel must never reach
// console.*, document.title or a download file name (B-03); the stored file name carries the upload sentinel.
const SENTINEL_FILE = '哨兵-简历-0001.pdf';
const SENTINEL_IN = '哨兵甲-用户原文-7f3a';
const SENTINEL_OUT = '哨兵乙-助手回复-9c1d';

const main = () => document.querySelector('.app-main') as HTMLElement;
const box = () => screen.getByRole('textbox', { name: '对话输入' });
const sendButton = () => screen.getByRole('button', { name: /发\s?送/ });
const submit = () => screen.getByRole('button', { name: /确认提交/ });
/** Results are only read from the main area: the sidebar also shows status words of the sessions. */
const resultShown = () => within(main()).queryByText(/^(已保存|已更新)$/) !== null;
const saveRequests = (backend: FakeBackend) => backend.requests.filter((r) => r.startsWith('POST ') && r.endsWith('/resume')).length;
const updateRequests = (backend: FakeBackend) => backend.requests.filter((r) => r.startsWith('PUT ')).length;

// Browser-side spies (F-02) and console capture (B-03); installed for every test of this file.
let consoleCalls: unknown[][] = [];
let setItem: ReturnType<typeof vi.spyOn>;
let getItem: ReturnType<typeof vi.spyOn>;
let indexedDBOpen: ReturnType<typeof vi.fn>;
let cookieWrite: Mock<() => undefined>;
let downloads: string[];
let revokeObjectURL: Mock<() => void>;

beforeEach(() => {
  consoleCalls = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
  setItem = vi.spyOn(Storage.prototype, 'setItem');
  getItem = vi.spyOn(Storage.prototype, 'getItem');
  indexedDBOpen = vi.fn();
  vi.stubGlobal('indexedDB', { open: indexedDBOpen });
  cookieWrite = vi.fn(() => undefined);
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieWrite });
  downloads = [];
  revokeObjectURL = vi.fn(() => undefined);
  URL.createObjectURL = vi.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as unknown as Record<string, unknown>).cookie;
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

async function upload(container: HTMLElement, name: string) {
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], name, { type: 'application/pdf' }));
  await screen.findByRole('heading', { name: /基本信息/ });
}

/** Sends a chat message and applies the suggestion of its reply. */
async function askAndApply(text: string) {
  await userEvent.type(box(), text);
  await userEvent.click(sendButton());
  const card = await screen.findByLabelText('修改建议');
  await userEvent.click(within(card).getByRole('button', { name: /^应\s?用$/ }));
  await within(card).findByText('已应用 ✓');
}

/** Confirms the basic section (name, phone, email are core fields and must be confirmed before submitting). */
async function confirmBasic() {
  await userEvent.click(screen.getByRole('button', { name: /确认本区/ }));
  await waitFor(() => expect(within(document.querySelector('[data-field="phone"]') as HTMLElement).getByText('已确认')).toBeInTheDocument());
}

/** "其余都没问题" opens the final review; the rest is unconfirmed, so submitting asks first (REQ-FE-04.2). */
async function confirmAll() {
  await confirmBasic();
  await userEvent.click(screen.getByRole('button', { name: /其余都没问题/ }));
  await screen.findByRole('heading', { name: '最终确认' });
}

async function submitAfterWarning() {
  await userEvent.click(submit());
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续确认' }));
}

describe('session flow end to end (REQ-FE-01..09, 3.1 主流程)', () => {
  it('upload, chat, apply, confirm, save, re-upload, update: nothing is shown as saved before the confirmation', async () => {
    // Session 1 applies 采购总监 and is saved. Session 2 (same person) applies 供应链总监, so the update candidate differs.
    const backend = new FakeBackend({
      suggest: (content) => [sampleSuggestion({ new_value: content.includes('确认提交') ? '供应链总监' : '采购总监' })],
      reply: () => SENTINEL_OUT,
    });
    stubFetch(backend.handle);
    const { container } = render(<App />);

    // Session 1: reviewing → chat → apply → confirm → save
    await upload(container, SENTINEL_FILE);
    await askAndApply(SENTINEL_IN);
    expect(within(main()).queryByText(SENTINEL_OUT)).toBeInTheDocument();
    await confirmAll();
    expect(saveRequests(backend)).toBe(0);
    expect(resultShown()).toBe(false);
    await submitAfterWarning();
    expect(await within(main()).findByText('已保存')).toBeInTheDocument();
    expect(saveRequests(backend)).toBe(1);

    // Session 2 (same person): the chat text "确认提交" must not save or update (F-03, REQ-FE-04.9)
    await upload(container, SENTINEL_FILE);
    await askAndApply('确认提交，按本次内容更新');
    expect(saveRequests(backend)).toBe(1);
    expect(updateRequests(backend)).toBe(0);
    expect(resultShown()).toBe(false);

    // Same record found: already_saved shows one sentence; "已保存" / "已更新" must not appear (REQ-FE-04.5)
    await confirmAll();
    await submitAfterWarning();
    expect(await within(main()).findByText('该简历已保存过')).toBeInTheDocument();
    expect(saveRequests(backend)).toBe(2);
    expect(within(main()).queryByText(/^已保存$|^已更新$/)).not.toBeInTheDocument();

    // Difference card lists the new job title; confirming sends exactly one PUT and only then shows "已更新"
    await userEvent.click(screen.getByRole('button', { name: '按本次内容更新' }));
    const diff = screen.getByLabelText('更新差异');
    expect(within(diff).getByText('供应链总监')).toBeInTheDocument();
    await userEvent.click(within(diff).getByRole('button', { name: /确认更新/ }));
    expect(await within(main()).findByText('已按本次内容更新')).toBeInTheDocument();
    expect(updateRequests(backend)).toBe(1);
    expect(backend.bodies.filter((b) => b.method === 'PUT').map((b) => b.body)).toEqual([{ confirm_update: true }]);

    // Archive: the record is updated in place; the original file downloads under a generic name and its URL is released
    await userEvent.click(screen.getAllByText('已归档简历')[0]!);
    await userEvent.click(await screen.findByRole('button', { name: '测试用户甲' }));
    const drawer = (await screen.findByText('简历详情')).closest('.ant-drawer') as HTMLElement;
    expect(await within(drawer).findByText(SENTINEL_FILE)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: /打开原始文件/ }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic'));
    expect(downloads).toEqual(['原始简历.pdf']);
    await userEvent.click(screen.getAllByText('对话')[0]!);

    // Deleting one session keeps the archived record (REQ-FE-05.5, 08)
    await userEvent.click(screen.getAllByRole('button', { name: '删除会话 简历 · 测试用户甲' })[0]!);
    await userEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(backend.sessions.size).toBe(1));
    expect(backend.resumes.size).toBe(1);

    // B-03 and F-02 across the whole flow
    const logged = JSON.stringify(consoleCalls) + document.title;
    expect(logged).not.toContain(SENTINEL_IN);
    expect(logged).not.toContain(SENTINEL_OUT);
    expect(logged).not.toContain(SENTINEL_FILE);
    expect(document.title).not.toContain('哨兵');
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(indexedDBOpen).not.toHaveBeenCalled();
    expect(cookieWrite).not.toHaveBeenCalled();
  });
});
