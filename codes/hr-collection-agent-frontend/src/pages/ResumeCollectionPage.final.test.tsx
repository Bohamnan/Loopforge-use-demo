import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSavedAt } from '../components/SavedResultCard';
import {
  errorResponse,
  jsonResponse,
  sampleCreateResumeResponse,
  sampleDraft,
  stubFetch,
} from '../test/ApiMocks';
import type { DraftResponse } from '../types/Draft';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>,
  );
}

function allConfirmed(): DraftResponse {
  const draft = sampleDraft();
  for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
  return draft;
}

/** Core confirmed, but some other fields still unconfirmed. */
function coreConfirmedOnly(): DraftResponse {
  const draft = sampleDraft();
  for (const key of ['name', 'phone', 'email'] as const) draft.fields[key].status = 'confirmed';
  return draft;
}

type Responder = (init: RequestInit) => Response | Promise<Response>;

function backend(draft: DraftResponse, post: Responder = () => jsonResponse(201, sampleCreateResumeResponse())) {
  return stubFetch((url, init) => {
    if (url === '/api/v1/resumes') return post(init) as Response;
    if (init.method === 'GET') return jsonResponse(200, draft);
    return errorResponse(500, { code: 'internal_error' });
  });
}
const posts = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls.filter(([url]) => url === '/api/v1/resumes');
const others = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls.filter(([url, init]) => url !== '/api/v1/resumes' && init.method !== 'GET');
const submit = () => screen.getByRole('button', { name: /确认提交/ });
const noSuccessShown = () => {
  expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
  expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  expect(screen.queryByText('该简历已保存过')).not.toBeInTheDocument();
};

async function openFinal(draft = allConfirmed(), post?: Responder) {
  const mock = backend(draft, post);
  renderPage();
  await screen.findByText('已为你恢复未完成的简历');
  if (!screen.queryByRole('button', { name: /确认提交/ })) {
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
  }
  await screen.findByRole('button', { name: /确认提交/ });
  return mock;
}

describe('REQ-FE-04.1 独立的最终确认，核心三项就绪才可点', () => {
  it('opens the final review with an enabled "确认提交" when everything is confirmed', async () => {
    await openFinal();
    expect(submit()).toBeEnabled();
    expect(screen.getByRole('heading', { name: /最终确认/ })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(22);
  });

  it('keeps the button disabled with a reason while name / phone / email are not all confirmed, and leads to the basic section', async () => {
    const draft = coreConfirmedOnly();
    draft.fields.phone.status = 'recognized';
    const mock = await openFinal(draft);
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/请先确认姓名、手机号、邮箱/)).toBeInTheDocument();
    fireEvent.click(submit());
    expect(posts(mock)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /去确认基本信息/ }));
    const active = document.querySelector('[aria-current="true"]') as HTMLElement;
    expect(within(active).getByRole('heading', { name: /基本信息/ })).toBeInTheDocument();
  });

  it('keeps the button disabled when a confirmed core value is not valid', async () => {
    const draft = allConfirmed();
    draft.fields.email.value = 'not-an-email';
    await openFinal(draft);
    expect(submit()).toBeDisabled();
  });

  it('goes back to the sections with "我还要修改"', async () => {
    await openFinal();
    await userEvent.click(screen.getByRole('button', { name: '我还要修改' }));
    expect(screen.queryByRole('button', { name: /确认提交/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '其余都没问题' })).toBeInTheDocument();
  });
});

describe('REQ-FE-04.2 仍有未确认字段时先提示', () => {
  it('asks first; cancelling sends nothing; continuing sends one confirmation for the whole displayed content', async () => {
    const mock = await openFinal(coreConfirmedOnly());
    expect(screen.getByText(/还有 \d+ 项字段未确认/)).toBeInTheDocument();
    await userEvent.click(submit());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/继续将视为确认当前显示的全部内容/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /返\s?回检查/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(mock)).toHaveLength(0);

    await userEvent.click(submit());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续确认' }));
    expect(await screen.findByTestId('saved-result')).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(1);
  });

  it('sends straight away when nothing is unconfirmed (no dialog)', async () => {
    const mock = await openFinal();
    await userEvent.click(submit());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await screen.findByTestId('saved-result');
    expect(posts(mock)).toHaveLength(1);
  });

  it('asks before throwing away unsubmitted edits on the way to the final review', async () => {
    backend(coreConfirmedOnly());
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.type(screen.getByLabelText('个人主页'), 'x');
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '放弃修改并继续' }));
    expect(await screen.findByRole('button', { name: /确认提交/ })).toBeInTheDocument();
  });
});

describe('REQ-FE-04.3 成功之前不出现“已保存”，不做乐观更新（F-03）', () => {
  it('shows nothing like success while the request is still in flight', async () => {
    let release: (r: Response) => void = () => undefined;
    await openFinal(allConfirmed(), () => new Promise<Response>((r) => (release = r)) as unknown as Response);
    await userEvent.click(submit());
    noSuccessShown();
    expect(submit()).toBeDisabled();
    expect(screen.getByRole('heading', { name: /最终确认/ })).toBeInTheDocument();
    await act(async () => release(jsonResponse(201, sampleCreateResumeResponse())));
    expect(await screen.findByTestId('saved-result')).toBeInTheDocument();
  });

  it.each([
    ['500 save_failed', () => errorResponse(500, { code: 'save_failed', message: '保存失败，请重试。' })],
    ['500 internal_error', () => errorResponse(500, { code: 'internal_error', message: '内部错误' })],
    ['422 confirmation_required', () => errorResponse(422, { code: 'confirmation_required', message: '请先确认' })],
    ['non-JSON 502', () => new Response('<html>bad gateway</html>', { status: 502 })],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')) as unknown as Response],
  ])('never shows success after %s and stays on the final review', async (_name, post) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openFinal(allConfirmed(), post);
    await userEvent.click(submit());
    await screen.findByRole('alert');
    noSuccessShown();
    expect(screen.getByRole('heading', { name: /最终确认/ })).toBeInTheDocument();
  });

  it('never shows success after a timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((url, init) =>
      url === '/api/v1/resumes'
        ? (new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))) as unknown as Response)
        : jsonResponse(200, allConfirmed()),
    );
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(submit());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    noSuccessShown();
  });

  it('sends exactly {confirmed: true} with same-origin credentials', async () => {
    const mock = await openFinal();
    await userEvent.click(submit());
    await screen.findByTestId('saved-result');
    const [, init] = posts(mock)[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"confirmed":true}');
    expect(init.credentials).toBe('same-origin');
  });
});

describe('REQ-FE-04.4 保存成功：已保存 + 上传下一份，只保留姓名 / 文件名 / 保存时间（C-11、P-09）', () => {
  it('shows the saved card and clears all other resume content', async () => {
    const mock = await openFinal(allConfirmed(), () => jsonResponse(201, sampleCreateResumeResponse({ saved_at: '2026-11-10T09:00:00Z' })));
    await userEvent.click(submit());
    const card = await screen.findByTestId('saved-result');
    expect(within(card).getByText('已保存')).toBeInTheDocument();
    expect(within(card).getByText('测试用户甲')).toBeInTheDocument();
    expect(within(card).getByText('合成简历.pdf')).toBeInTheDocument();
    expect(within(card).getByText(formatSavedAt('2026-11-10T09:00:00Z'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传下一份' })).toBeInTheDocument();
    // everything else is gone from the page
    expect(document.body.textContent).not.toContain('13800138000');
    expect(document.body.textContent).not.toContain('test.user@example.com');
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /基本信息/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/记录编号|resume_id/)).not.toBeInTheDocument();
    expect(others(mock)).toHaveLength(0);
  });

  it('"上传下一份" returns to a clean empty state with the upload bar', async () => {
    await openFinal();
    await userEvent.click(submit());
    await userEvent.click(await screen.findByRole('button', { name: '上传下一份' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /上传简历/ }).length).toBeGreaterThan(0);
  });

  it('hides the upload bar on the result screen', async () => {
    await openFinal();
    await userEvent.click(submit());
    await screen.findByTestId('saved-result');
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('REQ-FE-04.5 already_saved：只显示文字，不展示已有记录（D-04）', () => {
  it('shows only "该简历已保存过" and none of the record content', async () => {
    await openFinal(allConfirmed(), () => jsonResponse(200, sampleCreateResumeResponse({ already_saved: true })));
    await userEvent.click(submit());
    expect(await screen.findByText('该简历已保存过')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    for (const text of ['测试用户甲', '合成简历.pdf', '13800138000', 'test.user@example.com']) {
      expect(document.body.textContent).not.toContain(text);
    }
    expect(screen.getByRole('button', { name: '上传下一份' })).toBeInTheDocument();
  });

  it('decides by already_saved only, not by the HTTP status (O-08)', async () => {
    const { unmount } = render(<div />);
    unmount();
    await openFinal(allConfirmed(), () => jsonResponse(201, sampleCreateResumeResponse({ already_saved: true })));
    await userEvent.click(submit());
    expect(await screen.findByText('该简历已保存过')).toBeInTheDocument();
  });

  it('shows the saved card when already_saved is false even with HTTP 200', async () => {
    await openFinal(allConfirmed(), () => jsonResponse(200, sampleCreateResumeResponse({ already_saved: false })));
    await userEvent.click(submit());
    expect(await screen.findByTestId('saved-result')).toBeInTheDocument();
  });
});

describe('REQ-FE-04.6 超时 / 网络失败：不提示成功，可直接重试，不查询状态（C-05）', () => {
  it('allows an immediate retry after a timeout and never queries any status', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempt = 0;
    const mock = stubFetch((url, init) => {
      if (url !== '/api/v1/resumes') return jsonResponse(200, allConfirmed());
      attempt += 1;
      return attempt === 1
        ? (new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))) as unknown as Response)
        : jsonResponse(201, sampleCreateResumeResponse());
    });
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(submit());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('未收到保存结果');
    noSuccessShown();
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('saved-result')).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(2);
    // only the first draft read and the two confirmation requests: no status lookup of any kind
    expect(mock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET /api/v1/resume-drafts/current',
      'POST /api/v1/resumes',
      'POST /api/v1/resumes',
    ]);
  });

  it('allows an immediate retry after a network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempt = 0;
    const mock = await openFinal(allConfirmed(), () => {
      attempt += 1;
      return attempt === 1 ? (Promise.reject(new TypeError('Failed to fetch')) as unknown as Response) : jsonResponse(201, sampleCreateResumeResponse());
    });
    await userEvent.click(submit());
    await screen.findByRole('alert');
    noSuccessShown();
    await userEvent.click(submit());
    expect(await screen.findByTestId('saved-result')).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(2);
  });
});

describe('REQ-FE-04.7 草稿不存在：可能已保存，请重新上传核实（D-01）', () => {
  it('shows the check hint in the empty state and never a success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openFinal(allConfirmed(), () => errorResponse(404, { code: 'draft_not_found' }));
    await userEvent.click(submit());
    expect(await screen.findByText('可能已保存，请重新上传核实')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });
});

describe('REQ-FE-04.8 请求期间防止重复点击', () => {
  it('sends one request however often the button is clicked, and locks the other controls', async () => {
    let release: (r: Response) => void = () => undefined;
    const mock = await openFinal(allConfirmed(), () => new Promise<Response>((r) => (release = r)) as unknown as Response);
    await userEvent.click(submit());
    fireEvent.click(submit());
    fireEvent.click(submit());
    expect(posts(mock)).toHaveLength(1);
    expect(screen.getByRole('button', { name: '我还要修改' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /新对话/ })).toBeDisabled();
    await act(async () => release(jsonResponse(201, sampleCreateResumeResponse())));
    await screen.findByTestId('saved-result');
    expect(posts(mock)).toHaveLength(1);
  });
});

describe('field errors from the confirmation (D-06)', () => {
  it('goes back to the sections with the reason shown at the field', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openFinal(allConfirmed(), () =>
      errorResponse(422, { code: 'validation_failed', message: '提交内容有误', details: [{ field: 'phone', reason: 'invalid_format' }] }),
    );
    await userEvent.click(submit());
    await waitFor(() => expect(screen.queryByRole('button', { name: /确认提交/ })).not.toBeInTheDocument());
    noSuccessShown();
    expect(within(document.querySelector('[data-field="phone"]') as HTMLElement).getByText('格式不正确')).toBeInTheDocument();
  });
});

describe('a stray file drop must never leave the page (review SUGGEST: drag-and-drop)', () => {
  const dropFile = () => fireEvent.drop(document, { dataTransfer: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });

  it('is cancelled on the result screen, where there is no upload bar', async () => {
    await openFinal();
    await userEvent.click(submit());
    await screen.findByTestId('saved-result');
    expect(dropFile()).toBe(false);
  });

  it('is cancelled while the confirmation is in flight (upload bar disabled)', async () => {
    let release: (r: Response) => void = () => undefined;
    const mock = await openFinal(allConfirmed(), () => new Promise<Response>((r) => (release = r)) as unknown as Response);
    await userEvent.click(submit());
    expect(dropFile()).toBe(false);
    expect(mock.mock.calls.filter(([, init]) => init.method === 'POST' && (init.body instanceof FormData))).toHaveLength(0);
    await act(async () => release(jsonResponse(201, sampleCreateResumeResponse())));
  });

  it('is cancelled while the draft cannot be read (no upload bar)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(500, { code: 'internal_error' }));
    renderPage();
    await screen.findByRole('button', { name: /重\s?试/ });
    expect(dropFile()).toBe(false);
  });

  it('is cancelled while the draft is still loading', () => {
    stubFetch(() => new Promise<Response>(() => undefined) as unknown as Response);
    renderPage();
    expect(dropFile()).toBe(false);
  });
});


describe('a 2xx answer that is not a valid save response is never shown as success (review SUGGEST-2, F-03)', () => {
  it.each([
    ['200 with {}', 200, {}],
    ['201 with {}', 201, {}],
    ['missing already_saved', 201, { resume_id: 'r1', saved_at: '2026-11-10T09:00:00Z' }],
    ['already_saved is not a boolean', 201, { resume_id: 'r1', already_saved: 'yes', saved_at: '2026-11-10T09:00:00Z' }],
  ])('%s keeps the final review with an error and a retry', async (_name, status, payload) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openFinal(allConfirmed(), () => jsonResponse(status, payload));
    await userEvent.click(submit());
    await screen.findByRole('alert');
    noSuccessShown();
    expect(screen.getByRole('heading', { name: /最终确认/ })).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });
});
