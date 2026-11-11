import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_SESSION_ID, errorResponse, jsonResponse, sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { createGate, FakeBackend, type Fault } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PUT_RESUME = `PUT /api/v1/sessions/${SAMPLE_SESSION_ID}/resume`;
const GET_SESSION = `GET /api/v1/sessions/${SAMPLE_SESSION_ID}`;

/** A saved-before session (update_state=pending): the candidate changes job_title and clears expected_salary. */
async function openPending(faults: Fault[] = []) {
  const pending = sampleSessionDetail('pending');
  const backend = new FakeBackend({ sessions: [pending], resumes: [pending.resume!], faults });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
  expect(await within(main()).findByText('该简历已保存过')).toBeInTheDocument();
  return backend;
}
const main = () => document.querySelector('.app-main') as HTMLElement;
const updatedShown = () => within(main()).queryByText(/^已更新$/) !== null;
const card = () => screen.getByLabelText('更新差异');
const puts = (backend: FakeBackend) => backend.bodies.filter((b) => b.method === 'PUT');
async function openDiff() {
  await userEvent.click(screen.getByRole('button', { name: '按本次内容更新' }));
  return card();
}

describe('update diff card (REQ-FE-09.2, red line: clears must be listed)', () => {
  it('opens from the quick reply without any request and lists the cleared field as "将被清空"', async () => {
    const backend = await openPending();
    const before = backend.requests.length;
    const diff = await openDiff();
    expect(backend.requests.length).toBe(before);
    expect(within(diff).getByText(/原 合成简历\.pdf → 新 合成简历-新\.pdf/)).toBeInTheDocument();
    const cleared = diff.querySelector('[data-field="expected_salary"]') as HTMLElement;
    expect(within(cleared).getByText('将被清空')).toBeInTheDocument();
    expect(within(diff.querySelector('[data-field="job_title"]') as HTMLElement).getByText('采购总监')).toBeInTheDocument();
    expect(within(diff).getByText(/其余 20 项相同/)).toBeInTheDocument();
    expect(updatedShown()).toBe(false);
  });

  it('cancel closes the card and keeps the record unchanged', async () => {
    const backend = await openPending();
    await openDiff();
    await userEvent.click(within(card()).getByRole('button', { name: /^取\s?消$/ }));
    expect(screen.queryByLabelText('更新差异')).not.toBeInTheDocument();
    expect(puts(backend)).toHaveLength(0);
  });
});

describe('F-03: "已更新" only after a confirmed update (HIGH_RISK, deterministic)', () => {
  it('sends exactly {confirm_update: true} once per click; "已更新" only after the 2xx answer and re-read', async () => {
    const hold = createGate();
    const backend = await openPending([{ match: PUT_RESUME, gate: hold.gate }]);
    await openDiff();
    await userEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    fireEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    expect(updatedShown()).toBe(false); // in flight
    hold.open();
    await waitFor(() => expect(updatedShown()).toBe(true));
    expect(puts(backend).map((p) => p.body)).toEqual([{ confirm_update: true }]);
    expect(within(main()).getByText('已按本次内容更新')).toBeInTheDocument();
    expect(within(main()).getByText('采购总监')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '按本次内容更新' })).not.toBeInTheDocument();
  });

  it('save_failed: no "已更新", says the record is unchanged, the card stays for a retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openPending([{ match: PUT_RESUME, response: () => errorResponse(500, { code: 'save_failed', message: '更新未完成' }) }]);
    await openDiff();
    await userEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    expect(await within(card()).findByText('已有简历未改变。')).toBeInTheDocument();
    expect(updatedShown()).toBe(false);
    expect(backend.saveAnswered).toBe(false);
    await userEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    await waitFor(() => expect(updatedShown()).toBe(true));
  });

  it('a 2xx answer of the wrong shape is not "已更新"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openPending([{ match: PUT_RESUME, response: () => jsonResponse(200, { resume_id: 'x' }) }]);
    await openDiff();
    await userEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    expect(await within(card()).findByText(/无法确认是否已更新/)).toBeInTheDocument();
    expect(updatedShown()).toBe(false);
  });

  it.each([
    ['the update took effect', true, true],
    ['the update never arrived', false, false],
  ])('unknown result (network), then "重新读取核对": %s -> "已更新" = %s', async (_name, afterEffect, updated) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = await openPending([{ match: PUT_RESUME, networkError: true, afterEffect }]);
    await openDiff();
    await userEvent.click(within(card()).getByRole('button', { name: /确认更新/ }));
    expect(await within(card()).findByText(/无法确认是否已更新/)).toBeInTheDocument();
    expect(updatedShown()).toBe(false);
    await userEvent.click(within(card()).getByRole('button', { name: /重新读取核对/ }));
    await waitFor(() => expect(backend.count(GET_SESSION)).toBe(2));
    await waitFor(() => expect(updatedShown()).toBe(updated));
    expect(puts(backend)).toHaveLength(1);
    if (!updated) expect(card()).toBeInTheDocument();
  });
});
