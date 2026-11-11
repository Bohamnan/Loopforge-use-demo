import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleArchivedResume, sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { FakeBackend, type Fault } from '../test/FakeBackend';
import { RESUME_FIELD_KEYS, type ResumeFields } from '../types/ResumeModel';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID = '00000000-0000-4000-8000-0000000000d1';
const POST_RESUME = `POST /api/v1/sessions/${ID}/resume`;
const GET_SESSION = `GET /api/v1/sessions/${ID}`;

function confirmedFields(): ResumeFields {
  const fields = sampleSessionDetail('reviewing').fields as ResumeFields;
  for (const key of RESUME_FIELD_KEYS) fields[key].status = 'confirmed';
  return fields;
}

interface Setup {
  fields?: ResumeFields;
  faults?: Fault[];
  /** An archived record with the same name / phone / email exists: the save answers already_saved. */
  existing?: boolean;
}

/** Opens a reviewing session whose fields are all confirmed, so the final review shows at once. */
async function openFinal({ fields = confirmedFields(), faults = [], existing = false }: Setup = {}) {
  const backend = new FakeBackend({
    sessions: [sampleSessionDetail('reviewing', { session_id: ID, fields })],
    resumes: existing ? [sampleArchivedResume()] : [],
    faults,
  });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
  const allConfirmed = RESUME_FIELD_KEYS.every((key) => fields[key].status === 'confirmed');
  await screen.findByRole('heading', { name: allConfirmed ? '最终确认' : /基本信息/ });
  return backend;
}
const main = () => document.querySelector('.app-main') as HTMLElement;
const submit = () => screen.getByRole('button', { name: /确认提交/ });
/** "已保存" / "已更新" anywhere in the main area (the side bar's status tags are not results). */
const successShown = () => within(main()).queryByText(/^(已保存|已更新)$/) !== null;
const posts = (backend: FakeBackend) => backend.bodies.filter((b) => b.method === 'POST' && b.url.endsWith('/resume'));

describe('final review (REQ-FE-04.1, 04.2)', () => {
  it('keeps "确认提交" disabled with a reason while a core field is not confirmed', async () => {
    const fields = confirmedFields();
    fields.phone.status = 'recognized';
    const backend = await openFinal({ fields });
    await userEvent.click(screen.getByRole('button', { name: /其余都没问题/ }));
    expect(submit()).toBeDisabled();
    expect(screen.getByText('请先确认姓名、手机号、邮箱后再提交。')).toBeInTheDocument();
    fireEvent.click(submit());
    expect(posts(backend)).toHaveLength(0);
  });

  it('asks first when fields are unconfirmed; cancel sends nothing, continue sends once', async () => {
    const fields = confirmedFields();
    fields.gender.status = 'missing';
    const backend = await openFinal({ fields });
    await userEvent.click(screen.getByRole('button', { name: /其余都没问题/ }));
    await userEvent.click(submit());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '返回检查' }));
    expect(posts(backend)).toHaveLength(0);
    await userEvent.click(submit());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '继续确认' }));
    await waitFor(() => expect(successShown()).toBe(true));
    expect(posts(backend)).toHaveLength(1);
  });

  it('422 returns to the section of the field with the reason shown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openFinal({
      faults: [{ match: POST_RESUME, response: () => errorResponse(422, { code: 'validation_failed', details: [{ field: 'email', reason: 'invalid_format' }] }) }],
    });
    await userEvent.click(submit());
    const row = await waitFor(() => document.querySelector('section [data-field="email"]') as HTMLElement);
    expect(await within(row).findByText('格式不正确')).toBeInTheDocument();
    expect(successShown()).toBe(false);
  });
});

describe('F-03: "已保存" only after a confirmed save (HIGH_RISK, deterministic)', () => {
  it('saves with exactly {confirmed: true}, once per click, then shows the saved card from the re-read session', async () => {
    const backend = await openFinal({ faults: [{ match: POST_RESUME, delayMs: 30 }] });
    await userEvent.click(submit());
    fireEvent.click(submit());
    fireEvent.click(submit());
    expect(successShown()).toBe(false); // in flight
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(successShown()).toBe(true));
    expect(backend.saveAnswered).toBe(true);
    expect(posts(backend).map((p) => p.body)).toEqual([{ confirmed: true }]);
    expect(within(main()).getByText('测试用户甲')).toBeInTheDocument();
    expect(within(main()).queryByText(/resume_id|记录编号/)).not.toBeInTheDocument();
    expect(backend.count(GET_SESSION)).toBe(2); // opened + re-read after the save
  });

  it.each<[string, Fault['response'] | undefined, boolean]>([
    ['5xx internal_error', () => errorResponse(500, { code: 'internal_error', message: '服务内部错误' }), false],
    ['save_failed', () => errorResponse(500, { code: 'save_failed', message: '保存失败，请重试' }), false],
    ['409 session_read_only, re-read still reviewing', () => errorResponse(409, { code: 'session_read_only', message: '会话只读' }), true],
    ['a 2xx answer of the wrong shape, re-read still reviewing', () => jsonResponse(201, { resume_id: 'x' }), true],
    ['a network failure, re-read still reviewing', undefined, true],
  ])('%s: no success anywhere, the session stays in review and can be retried', async (_name, response, verifies) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fault: Fault = response ? { match: POST_RESUME, response } : { match: POST_RESUME, networkError: true };
    const backend = await openFinal({ faults: [fault] });
    await userEvent.click(submit());
    await waitFor(() => expect(within(main()).getByRole('alert')).toBeInTheDocument());
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(successShown()).toBe(false);
    expect(backend.saveAnswered).toBe(false);
    expect(backend.count(GET_SESSION)).toBe(verifies ? 2 : 1);
    await userEvent.click(submit()); // retry is possible and succeeds
    await waitFor(() => expect(successShown()).toBe(true));
    expect(posts(backend)).toHaveLength(2);
  });

  it('the save took effect but the answer was lost: the re-read finds it saved, shows success and sends nothing again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openFinal({ faults: [{ match: POST_RESUME, afterEffect: true, networkError: true }] });
    await userEvent.click(submit());
    await waitFor(() => expect(successShown()).toBe(true));
    expect(posts(backend)).toHaveLength(1);
    expect(backend.count(GET_SESSION)).toBe(2);
  });

  it.each([
    ['201', 201],
    ['200', 200],
  ])('already_saved=true answered with HTTP %s shows "该简历已保存过", never "已保存" or "已更新"', async (_name, status) => {
    const answer = () => jsonResponse(status, { resume_id: 'r1', already_saved: true, saved_at: '2026-11-10T09:00:00Z' });
    await openFinal({ existing: true, faults: [{ match: POST_RESUME, afterEffect: true, response: answer }] });
    await userEvent.click(submit());
    expect(await within(main()).findByText('该简历已保存过')).toBeInTheDocument();
    expect(successShown()).toBe(false);
  });

  it('already_saved=false answered with HTTP 200 still shows the saved card (decided by the field, not the status)', async () => {
    const answer = () => jsonResponse(200, { resume_id: 'r1', already_saved: false, saved_at: '2026-11-10T09:00:00Z' });
    await openFinal({ faults: [{ match: POST_RESUME, afterEffect: true, response: answer }] });
    await userEvent.click(submit());
    await waitFor(() => expect(successShown()).toBe(true));
  });

  it('saved but the re-read failed: the confirmed result stays, with "重新读取"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openFinal();
    // From now on reading the session fails (the open read above already succeeded).
    stubFetch((url, init) =>
      (init.method ?? 'GET') === 'GET' && url.endsWith(ID) ? errorResponse(500, { code: 'internal_error' }) : backend.handle(url, init),
    );
    await userEvent.click(submit());
    await waitFor(() => expect(successShown()).toBe(true));
    expect(screen.getByRole('button', { name: /重新读取/ })).toBeInTheDocument();
  });
});
