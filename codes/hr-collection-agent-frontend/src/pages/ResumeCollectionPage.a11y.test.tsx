import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, errorResponse, jsonResponse, sampleCreateResumeResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  // @ts-expect-error restore the jsdom default
  delete Element.prototype.scrollIntoView;
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

function backend(draft = sampleDraft(), post?: () => Response) {
  let current = draft;
  return stubFetch((url, init) => {
    if (url === '/api/v1/resumes') return post ? post() : jsonResponse(201, sampleCreateResumeResponse());
    if (init.method === 'GET') return jsonResponse(200, current);
    current = applyPatch(current, (JSON.parse(init.body as string) as { fields: Record<string, unknown> }).fields);
    return jsonResponse(200, current);
  });
}
const focused = () => document.activeElement as HTMLElement | null;

describe('announcements (TD-13)', () => {
  it('announces loading politely', () => {
    stubFetch(() => new Promise<Response>(() => undefined) as unknown as Response);
    render(page());
    expect(screen.getByRole('status')).toHaveTextContent('正在读取草稿');
  });

  it('a restored-draft notice is polite, so it never competes with real alerts', async () => {
    backend();
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    expect(screen.getByText('已为你恢复未完成的简历').closest('[role]')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('errors are announced as exactly one alert even with a notice on screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((url, init) => (url.endsWith('/current') ? jsonResponse(200, sampleDraft()) : init.method === 'POST' ? errorResponse(502, { code: 'parse_failed', message: '简历解析失败' }) : jsonResponse(200, {})));
    const { container } = render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'n.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续上传' }));
    await screen.findByText('简历解析失败');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('focus management (TD-13)', () => {
  it('puts focus on the first section to review once the draft is shown', async () => {
    backend();
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'section:basic'));
    expect(focused()).toHaveTextContent('基本信息');
  });

  it('moves focus to the next section after a section is confirmed', async () => {
    backend();
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(screen.getByRole('button', { name: /确认本区/ }));
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'section:intent'));
    expect(focused()).toHaveTextContent('求职意向');
  });

  it('moves focus to the section chosen with 修改', async () => {
    backend();
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    const personal = screen.getByRole('heading', { name: /个人信息/ }).closest('section') as HTMLElement;
    await userEvent.click(within(personal).getByRole('button', { name: /修\s?改/ }));
    await waitFor(() => expect(focused()).toHaveTextContent('个人信息'));
  });

  it('moves focus to the final review and then to the result', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    backend(draft);
    render(page());
    await screen.findByRole('button', { name: /确认提交/ });
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'final'));
    await userEvent.click(screen.getByRole('button', { name: /确认提交/ }));
    await screen.findByTestId('saved-result');
    await waitFor(() => expect(focused()).toHaveAttribute('data-focus-key', 'saved'));
  });
});

describe('keyboard (TD-13)', () => {
  it('the final confirmation can be done with the keyboard alone', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    const mock = backend(draft);
    render(page());
    const button = await screen.findByRole('button', { name: /确认提交/ });
    button.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByTestId('saved-result');
    expect(mock.mock.calls.filter(([u]) => u === '/api/v1/resumes')).toHaveLength(1);
  });

  it('every input has a programmatic label', async () => {
    backend();
    render(page());
    await screen.findByText('已为你恢复未完成的简历');
    for (const input of Array.from(document.querySelectorAll('input:not([type="file"]), textarea'))) {
      const el = input as HTMLInputElement;
      const labelled = el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
      expect(labelled).toBeTruthy();
    }
    fireEvent.blur(screen.getByLabelText('姓名'));
  });
});
