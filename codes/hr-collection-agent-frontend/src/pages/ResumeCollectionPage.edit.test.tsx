import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, errorResponse, stubFetch } from '../test/ApiMocks';
import { SECTIONS_READY, fieldsResponse, sampleDraft, sessionStub, uploadResume, type FieldsPatch } from '../test/PageHarness';
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

type Patch = FieldsPatch;

/** Fake backend: upload creates the session, PATCH applies the body (or a custom responder). */
const backend = sessionStub;
const patches = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls.filter(([, init]) => init.method === 'PATCH');
const patchBody = (mock: ReturnType<typeof stubFetch>, n = 0) => JSON.parse(patches(mock)[n]![1].body as string) as Patch;
const confirmButton = () => screen.getByRole('button', { name: /确认本区|确认修改|已确认/ });

async function open(draft = sampleDraft(), onPatch?: Parameters<typeof backend>[1]) {
  const mock = backend(draft, onPatch);
  const { container } = renderPage();
  await uploadResume(container);
  await SECTIONS_READY();
  return mock;
}

describe('section review: core fields (REQ-FE-03.4, 03.5)', () => {
  it('guides the user to fill a missing core field and blocks confirmation until it is valid', async () => {
    const draft = sampleDraft();
    draft.fields.email = { value: null, status: 'missing' };
    await open(draft);
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText('请先补充并修正姓名、手机号、邮箱')).toBeInTheDocument();
    expect(within(document.querySelector('[data-field="email"]') as HTMLElement).getByText('必填')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.co');
    expect(confirmButton()).toBeEnabled();
  });

  it('flags a badly formatted phone or email right after the user leaves the field', async () => {
    await open();
    await userEvent.clear(screen.getByLabelText('手机号'));
    await userEvent.type(screen.getByLabelText('手机号'), '12345');
    fireEvent.blur(screen.getByLabelText('手机号'));
    expect(within(document.querySelector('[data-field="phone"]') as HTMLElement).getByText('格式不正确')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('邮箱'));
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b');
    fireEvent.blur(screen.getByLabelText('邮箱'));
    expect(within(document.querySelector('[data-field="email"]') as HTMLElement).getByText('格式不正确')).toBeInTheDocument();
  });

  it('submits the phone with spaces and hyphens removed (G-02)', async () => {
    const mock = await open();
    await userEvent.clear(screen.getByLabelText('手机号'));
    await userEvent.type(screen.getByLabelText('手机号'), '138 0013-8000');
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(patchBody(mock).fields.phone).toBe('13800138000');
  });
});

describe('section review: confirming a section (REQ-FE-03.2)', () => {
  it('sends only the fields of the active section, missing scalars as null, and moves on with the backend result', async () => {
    const mock = await open();
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ })); // jump chip
    await userEvent.type(screen.getByLabelText('期望城市'), '上海');
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(patchBody(mock).fields).toEqual({
      job_title: '供应链经理',
      expected_city: '上海',
      expected_salary: '30-40K',
      available_time: null,
    });
    // the section is now confirmed according to the backend response, and the next one is active
    const intent = screen.getByRole('heading', { name: /求职意向/ }).closest('section') as HTMLElement;
    await waitFor(() => expect(within(intent).getByTestId('section-status')).toHaveTextContent('已确认'));
    expect(intent).not.toHaveAttribute('aria-current');
    expect(document.querySelector('section[aria-current="true"]')).not.toBeNull();
    expect(screen.queryByText('未提交修改')).not.toBeInTheDocument();
  });

  it('does not touch other sections: their values and statuses stay as the backend reported', async () => {
    await open();
    await userEvent.click(confirmButton()); // basic
    await waitFor(() => expect(within(document.querySelector('[data-field="name"]') as HTMLElement).getByText('已确认')).toBeInTheDocument());
    expect(within(document.querySelector('[data-field="skills"]') as HTMLElement).getByText('待确认')).toBeInTheDocument();
  });

  it('sends an empty text list as [] to confirm it as empty', async () => {
    const mock = await open();
    await userEvent.click(screen.getByRole('button', { name: /证书与荣誉/ })); // jump chip: the section is missing
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(patchBody(mock).fields).toEqual({ certificates_honors: [] });
  });

  it('shows an edit as "未提交修改" without changing the status, until the section is confirmed', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ }));
    await userEvent.type(screen.getByLabelText('意向岗位'), '!');
    const row = document.querySelector('[data-field="job_title"]') as HTMLElement;
    expect(within(row).getByText('未提交修改')).toBeInTheDocument();
    expect(within(row).getByText('待确认')).toBeInTheDocument();
  });

  it('blocks a locally invalid section without sending anything and shows why', async () => {
    const mock = await open(sampleDraft());
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ }));
    fireEvent.change(screen.getByLabelText('意向岗位'), { target: { value: 'a'.repeat(501) } });
    await userEvent.click(confirmButton());
    expect(within(document.querySelector('[data-field="job_title"]') as HTMLElement).getByText('内容过长')).toBeInTheDocument();
    expect(patches(mock)).toHaveLength(0);
  });

  it('allows at most one PATCH in flight and locks the section meanwhile', async () => {
    let release: (r: Response) => void = () => undefined;
    const mock = await open(sampleDraft(), () => new Promise<Response>((resolve) => (release = resolve)) as unknown as Response);
    await userEvent.click(confirmButton());
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByLabelText('姓名')).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(patches(mock)).toHaveLength(1);
    await act(async () => release(fieldsResponse(applyPatch(sampleDraft().fields, { name: '测试用户甲' }))));
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
  });
});

describe('section review: errors (REQ-FE-03.6)', () => {
  it('shows 422 details next to the field with the reason text and does not echo the value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(sampleDraft(), () =>
      errorResponse(422, { code: 'validation_failed', message: '提交内容有误', details: [{ field: 'phone', reason: 'invalid_format' }] }),
    );
    await userEvent.click(confirmButton());
    const row = await waitFor(() => {
      const el = document.querySelector('[data-field="phone"]') as HTMLElement;
      within(el).getByText('格式不正确');
      return el;
    });
    expect(row).toBeInTheDocument();
    expect(screen.getByLabelText('手机号')).toHaveValue('13800138000');
  });

  it('keeps the typed edits and allows a retry after a timeout or a server error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const mock = await open(sampleDraft(), (body) => {
      calls += 1;
      return calls === 1 ? errorResponse(500, { code: 'internal_error', message: '服务内部错误' }) : fieldsResponse(applyPatch(sampleDraft().fields, body.fields));
    });
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ }));
    await userEvent.type(screen.getByLabelText('期望城市'), '上海');
    await userEvent.click(confirmButton());
    expect(await screen.findByText('服务内部错误')).toBeInTheDocument();
    expect(screen.getByLabelText('期望城市')).toHaveValue('上海');
    expect(confirmButton()).toBeEnabled();
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(2));
    expect(patchBody(mock, 1).fields.expected_city).toBe('上海');
  });

  it('returns to the empty state with "该会话已不存在" when the session no longer exists (REQ-FE-04.7)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(sampleDraft(), () => errorResponse(404, { code: 'session_not_found' }));
    await userEvent.click(confirmButton());
    expect(await screen.findByText('该会话已不存在')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /基本信息/ })).not.toBeInTheDocument();
  });
});

describe('text list editing (REQ-FE-03.3)', () => {
  it('adds, edits and deletes items and submits the whole new list', async () => {
    const mock = await open();
    const card = () => screen.getByRole('heading', { name: /专业技能/ }).closest('section') as HTMLElement;
    await userEvent.click(within(card()).getByRole('button', { name: /修\s?改/ }));
    await userEvent.click(within(card()).getByRole('button', { name: /添加一项/ }));
    const boxes = within(card()).getAllByRole('textbox');
    await userEvent.type(boxes[boxes.length - 1]!, 'SAP');
    await userEvent.type(boxes[0]!, '2');
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(patchBody(mock).fields).toEqual({ skills: ['Excel2', 'SAP'] });
  });

  it('keeps a blank row on blur and leaves it out of the submitted list', async () => {
    const mock = await open();
    const card = () => screen.getByRole('heading', { name: /专业技能/ }).closest('section') as HTMLElement;
    await userEvent.click(within(card()).getByRole('button', { name: /修\s?改/ }));
    await userEvent.click(within(card()).getByRole('button', { name: /添加一项/ }));
    expect(within(card()).getAllByRole('textbox')).toHaveLength(2);
    fireEvent.blur(within(card()).getAllByRole('textbox')[1]!);
    expect(within(card()).getAllByRole('textbox')).toHaveLength(2);
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(patchBody(mock).fields).toEqual({ skills: ['Excel'] });
  });
});

describe('quick replies (ADR-006)', () => {
  it('"确认无误" does the same as the confirm button', async () => {
    const mock = await open();
    await userEvent.click(screen.getByRole('button', { name: '确认无误' }));
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(Object.keys(patchBody(mock).fields)).toEqual(['name', 'phone', 'email', 'homepage']);
  });

  it('is disabled exactly when the confirm button is', async () => {
    const draft = sampleDraft();
    draft.fields.email = { value: null, status: 'missing' };
    await open(draft);
    expect(screen.getByRole('button', { name: '确认无误' })).toBeDisabled();
  });

  it('"其余都没问题" jumps to the final view without sending anything', async () => {
    const mock = await open();
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    expect(document.querySelector('section[aria-current="true"]')).toBeNull();
    expect(patches(mock)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /我还要修改/ })).toBeInTheDocument();
  });

  it('asks before dropping unsubmitted edits when jumping to the final view', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('个人主页'), 'x');
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/继续将放弃这些修改/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /返\s?回/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('个人主页')).toHaveValue('x');
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '放弃修改并继续' }));
    expect(await screen.findByRole('button', { name: /我还要修改/ })).toBeInTheDocument();
  });

  it('can come back from the interim final view to the sections', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    await userEvent.click(screen.getByRole('button', { name: /我还要修改/ }));
    expect(document.querySelector('section[aria-current="true"]')).not.toBeNull();
  });

  it('offers no free-text box besides the chat input (ADR-007)', async () => {
    await open();
    const boxes = Array.from(document.querySelectorAll('textarea')).filter((b) => b.getAttribute('aria-hidden') !== 'true');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['对话输入']);
    expect(RESUME_FIELD_KEYS).toHaveLength(22);
  });
});
