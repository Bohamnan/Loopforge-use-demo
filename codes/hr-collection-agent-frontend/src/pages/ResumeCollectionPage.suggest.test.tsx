import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, sampleSessionDetail, sampleSuggestion, stubFetch } from '../test/ApiMocks';
import { FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ID = '00000000-0000-4000-8000-0000000000c1';

async function openWithSuggestion(options: FakeBackendOptions = {}) {
  const backend = new FakeBackend({
    sessions: [sampleSessionDetail('reviewing', { session_id: ID })],
    suggest: () => [sampleSuggestion()],
    ...options,
  });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
  await screen.findByRole('heading', { name: /基本信息/ });
  await userEvent.type(screen.getByRole('textbox', { name: '对话输入' }), '岗位改成采购总监');
  await userEvent.click(screen.getByRole('button', { name: /发\s?送/ }));
  const card = await screen.findByLabelText('修改建议');
  return { backend, card };
}
const jobRow = () => document.querySelector('section [data-field="job_title"]') as HTMLElement;

describe('suggestion cards (REQ-FE-07.4-07.6)', () => {
  it('apply replaces the fields, does not jump, drops the edit of that field and offers a jump chip', async () => {
    const { card } = await openWithSuggestion();
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ }));
    fireEvent.change(screen.getByLabelText('意向岗位'), { target: { value: '我的草稿' } });
    await userEvent.click(within(card).getByRole('button', { name: /^应\s?用$/ }));
    expect(await within(card).findByText('已应用 ✓')).toBeInTheDocument();
    expect(screen.getByLabelText('意向岗位')).toHaveValue('采购总监'); // edit buffer of the applied field dropped (TD-03)
    expect(within(jobRow()).queryByText('未提交修改')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '查看求职意向分区' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^基本信息/ }));
    await userEvent.click(within(card).getByRole('button', { name: '查看求职意向分区' }));
    expect(within(document.querySelector('section[aria-current="true"]') as HTMLElement).getByRole('heading', { name: /求职意向/ })).toBeInTheDocument();
  });

  it('cancel marks the card cancelled and leaves the fields as they were', async () => {
    const { card } = await openWithSuggestion();
    await userEvent.click(within(card).getByRole('button', { name: /^取\s?消$/ }));
    expect(await within(card).findByText('已取消')).toBeInTheDocument();
    expect(within(jobRow()).getByText('供应链经理')).toBeInTheDocument();
  });

  it('suggestion_unavailable shows the message inside the card and refreshes it from the server', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { backend, card } = await openWithSuggestion({
      faults: [{ match: /\/apply$/, response: () => errorResponse(409, { code: 'suggestion_unavailable', message: '这条建议已处理' }) }],
    });
    const reads = backend.count(`GET /api/v1/sessions/${ID}`);
    await userEvent.click(within(card).getByRole('button', { name: /^应\s?用$/ }));
    expect(await within(screen.getByLabelText('修改建议')).findByText('这条建议已处理')).toBeInTheDocument();
    await waitFor(() => expect(backend.count(`GET /api/v1/sessions/${ID}`)).toBe(reads + 1));
  });
});
