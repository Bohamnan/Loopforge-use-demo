import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleCreateResumeResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import { FakeBackend } from '../test/FakeBackend';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

// Two whole-flow tests take about 5 s each and exceeded the default limit when the full suite runs in parallel.
vi.setConfig({ testTimeout: 15000 });

// Task 3.1: page level integration over an in-memory backend that follows the contract (synthetic data only).
// Every test also guards the security statics: no browser storage use, no resume content / response body in console.

const SENSITIVE = ['13800138000', 'test.user@example.com', '测试用户甲', '合成公司', '合成大学', '擅长供应商管理', '提示信息'];

let storageUse: string[] = [];
let consoleCalls: unknown[][] = [];
const originals = new Map<string, PropertyDescriptor | undefined>();

function watchStorage() {
  storageUse = [];
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    originals.set(name, Object.getOwnPropertyDescriptor(window, name));
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => {
        storageUse.push(name);
        return undefined;
      },
    });
  }
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    vi.spyOn(Storage.prototype, method as 'getItem').mockImplementation((() => {
      storageUse.push(`Storage.${method}`);
      return null;
    }) as never);
  }
}

function watchConsole() {
  consoleCalls = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
}

beforeEach(() => {
  watchStorage();
  watchConsole();
});

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else Reflect.deleteProperty(window, name);
  }
  originals.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expectNoLeaks() {
  expect(storageUse).toEqual([]);
  const logged = JSON.stringify(consoleCalls, (_key, value: unknown) =>
    value instanceof Error ? `${value.name}:${value.message}` : value,
  );
  for (const text of SENSITIVE) expect(logged).not.toContain(text);
}

function renderPage() {
  return render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>,
  );
}

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = (name = '合成简历.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
const sectionButton = () => screen.queryByRole('button', { name: /确认本区|确认修改/ });
const submit = () => screen.queryByRole('button', { name: /确认提交/ });
const noSuccessShown = () => {
  expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
  expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  expect(screen.queryByText('该简历已保存过')).not.toBeInTheDocument();
};

/** Confirms the active section until the page offers the final confirmation. Returns how many sections were sent. */
async function confirmAllSections(): Promise<number> {
  let sent = 0;
  for (let i = 0; i < 12 && !submit(); i += 1) {
    const button = sectionButton();
    if (!button) break;
    await userEvent.click(button);
    sent += 1;
    await screen.findByRole('button', { name: /确认本区|确认修改|已确认|确认提交/ });
  }
  if (!submit()) await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
  await screen.findByRole('button', { name: /确认提交/ });
  return sent;
}

describe('main flow: upload → section review (incl. experience) → final confirmation → saved', () => {
  it('walks the whole path against the contract, with the save visible only after the 201', async () => {
    const backend = new FakeBackend();
    stubFetch(backend.handle);
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);

    await userEvent.upload(fileInput(container), pdf());
    expect(await screen.findByText('合成简历.pdf')).toBeInTheDocument();
    noSuccessShown();

    // experience sections are part of the review and carry their sub-items
    expect(document.querySelector('[data-field="work_experiences"]')).not.toBeNull();
    expect(screen.getAllByText(/合成公司/).length).toBeGreaterThan(0);

    const sent = await confirmAllSections();
    expect(sent).toBeGreaterThan(0);
    noSuccessShown();
    const patches = backend.bodies.filter((b) => b.method === 'PATCH');
    expect(patches).toHaveLength(sent);
    // sections are sent one by one: no PATCH carries the whole resume
    for (const { body } of patches) expect(Object.keys((body as { fields: object }).fields).length).toBeLessThan(22);
    expect(backend.saveAnswered).toBe(false);

    await userEvent.click(submit()!);
    const saved = await screen.findByTestId('saved-result');
    expect(backend.saveAnswered).toBe(true);
    expect(within(saved).getByText('测试用户甲')).toBeInTheDocument();
    expect(within(saved).getByText('合成简历.pdf')).toBeInTheDocument();
    expect(backend.bodies.filter((b) => b.url === '/api/v1/resumes').map((b) => b.body)).toEqual([{ confirmed: true }]);

    // draft content is gone from the page; only name / file name / time remain
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expect(screen.queryByText('13800138000')).not.toBeInTheDocument();
    expect(screen.queryByText('test.user@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText(/00000000-0000-4000/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '上传下一份' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expectNoLeaks();
  });

  it('the data layer agrees with the screen: the second confirm answers 404 once the save went through', async () => {
    const backend = new FakeBackend({ draft: sampleDraft() });
    stubFetch(backend.handle);
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await confirmAllSections();
    await userEvent.click(submit()!);
    await screen.findByTestId('saved-result');
    expect(backend.draft).toBeNull();
    expect(backend.count('POST /api/v1/resumes')).toBe(1);
    expectNoLeaks();
  });
});

describe('draft recovery: 200 / 404 / 500', () => {
  it('200 restores the draft with a notice', async () => {
    stubFetch(new FakeBackend({ draft: sampleDraft() }).handle);
    renderPage();
    expect(await screen.findByText('已为你恢复未完成的简历')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]').length).toBeGreaterThan(0);
    expectNoLeaks();
  });

  it('404 shows the empty state with no error and nothing logged', async () => {
    stubFetch(new FakeBackend().handle);
    renderPage();
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(consoleCalls).toEqual([]);
    expectNoLeaks();
  });

  it('500 offers only a retry (no upload entry) and the retry restores the draft', async () => {
    let failing = true;
    const backend = new FakeBackend({
      draft: sampleDraft(),
      intercept: () => (failing ? errorResponse(500, { code: 'internal_error' }) : undefined),
    });
    stubFetch(backend.handle);
    const { container } = renderPage();
    await screen.findByText(/未能读取已有草稿/);
    expect(screen.queryByText(/上传简历文件/)).not.toBeInTheDocument();
    expect(fileInput(container)?.disabled ?? true).toBe(true);
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    expect(await screen.findByText('已为你恢复未完成的简历')).toBeInTheDocument();
    expectNoLeaks();
  });
});

describe('overwrite confirmation and new chat', () => {
  it('asks before overwriting; cancel sends no upload, continue replaces the draft', async () => {
    const backend = new FakeBackend({ draft: sampleDraft() });
    stubFetch(backend.handle);
    const { container } = renderPage();
    await screen.findByText('已为你恢复未完成的简历');

    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /取\s?消/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backend.count('POST /api/v1/resume-drafts')).toBe(0);

    await userEvent.upload(fileInput(container), pdf('新文件.pdf'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续上传' }));
    expect(await screen.findByText('新文件.pdf')).toBeInTheDocument();
    expect(backend.count('POST /api/v1/resume-drafts')).toBe(1);
    expectNoLeaks();
  });

  it('new chat clears the screen without any request; a reload restores the draft again', async () => {
    const backend = new FakeBackend({ draft: sampleDraft() });
    stubFetch(backend.handle);
    const first = renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '清空并开始' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expect(backend.requests).toEqual(['GET /api/v1/resume-drafts/current']);
    first.unmount();
    renderPage();
    expect(await screen.findByText('已为你恢复未完成的简历')).toBeInTheDocument();
    expectNoLeaks();
  });
});

describe('timeouts and failures', () => {
  const hang = (init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });

  it('an upload that takes longer than 75 s ends with the re-upload hint and unlocks the composer', async () => {
    vi.useFakeTimers();
    stubFetch(new FakeBackend({ intercept: (url, init) => (url === '/api/v1/resume-drafts' ? hang(init) : undefined) }).handle);
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
    expect(fileInput(container).disabled).toBe(false);
    expectNoLeaks();
  });

  it('a confirm timeout shows no success, and the immediate retry succeeds without any status lookup', async () => {
    vi.useFakeTimers();
    const confirmed = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) confirmed.fields[key].status = 'confirmed';
    const backend = new FakeBackend({
      draft: confirmed,
      intercept: (url, init, count) => (url === '/api/v1/resumes' && count === 1 ? hang(init) : undefined),
    });
    stubFetch(backend.handle);
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: /确认提交/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('未收到保存结果');
    noSuccessShown();
    expect(backend.saveAnswered).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /确认提交/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('saved-result')).toBeInTheDocument();
    expect(backend.requests.filter((r) => r !== 'GET /api/v1/resume-drafts/current')).toEqual([
      'POST /api/v1/resumes',
      'POST /api/v1/resumes',
    ]);
    expectNoLeaks();
  });

  async function openFinal(backend: FakeBackend) {
    stubFetch(backend.handle);
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await confirmAllSections();
  }

  it('already_saved=true (also on HTTP 200) shows one sentence and no record content', async () => {
    const backend = new FakeBackend({
      draft: sampleDraft(),
      confirm: () => jsonResponse(200, sampleCreateResumeResponse({ already_saved: true })),
    });
    await openFinal(backend);
    await userEvent.click(submit()!);
    expect(await screen.findByText('该简历已保存过')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
    expect(screen.queryByText('测试用户甲')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expectNoLeaks();
  });

  it('draft_not_found on confirm says "maybe saved" and never "saved"', async () => {
    const backend = new FakeBackend({
      draft: sampleDraft(),
      confirm: () => errorResponse(404, { code: 'draft_not_found' }),
    });
    await openFinal(backend);
    await userEvent.click(submit()!);
    expect(await screen.findByText('可能已保存，请重新上传核实')).toBeInTheDocument();
    noSuccessShown();
    expectNoLeaks();
  });

  it('5xx on confirm keeps the final screen, shows no success and can be retried', async () => {
    let attempt = 0;
    const backend = new FakeBackend({
      draft: sampleDraft(),
      confirm: () => {
        attempt += 1;
        return attempt === 1 ? errorResponse(500, { code: 'save_failed', message: '提示信息' }) : jsonResponse(201, sampleCreateResumeResponse());
      },
    });
    await openFinal(backend);
    await userEvent.click(submit()!);
    await screen.findByRole('alert');
    noSuccessShown();
    expect(backend.saveAnswered).toBe(true); // an answer arrived, but it was an error
    await userEvent.click(submit()!);
    expect(await screen.findByTestId('saved-result')).toBeInTheDocument();
    expectNoLeaks();
  });
});

describe('unsubmitted edits', () => {
  it('block the way to the final review until the user decides, and cancelling keeps the edit', async () => {
    const draft = sampleDraft();
    for (const key of ['name', 'phone', 'email'] as const) draft.fields[key].status = 'confirmed';
    const backend = new FakeBackend({ draft });
    stubFetch(backend.handle);
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.type(screen.getByLabelText('个人主页'), 'x');
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('存在未提交的修改')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /返\s?回/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(submit()).not.toBeInTheDocument();
    expect(screen.getByLabelText('个人主页')).toHaveValue('x');
    expect(backend.requests).toEqual(['GET /api/v1/resume-drafts/current']);
    expectNoLeaks();
  });
});

describe('security statics: the watchers themselves work', () => {
  it('detects browser storage access and console output carrying resume content', () => {
    Reflect.get(window, 'localStorage');
    Reflect.get(window, 'sessionStorage');
    Storage.prototype.setItem.call({}, 'k', 'v');
    expect(storageUse).toEqual(expect.arrayContaining(['localStorage', 'sessionStorage', 'Storage.setItem']));
    console.error('13800138000');
    expect(() => {
      storageUse = [];
      expectNoLeaks();
    }).toThrow();
  });
});
