import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { createGate, FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ID = sampleSessionDetail().session_id;

async function openReviewing(options: FakeBackendOptions = {}) {
  const backend = new FakeBackend({ sessions: [sampleSessionDetail('reviewing')], ...options });
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ResumeCollectionPage />
    </ConfigProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
  await screen.findByRole('heading', { name: /基本信息/ });
  return backend;
}
const newChat = () => screen.getByRole('button', { name: /新对话/ });
const writes = (backend: FakeBackend) => backend.requests.filter((r) => !r.startsWith('GET '));

describe('new chat clears the view only (TD-12 v2)', () => {
  it('without unsubmitted edits clears at once, calls nothing and keeps the session in the list', async () => {
    const backend = await openReviewing();
    await userEvent.click(newChat());
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(backend)).toEqual([]);
    expect(backend.sessions.has(ID)).toBe(true);
    expect(screen.getByRole('button', { name: /^简历 · 测试用户甲/ })).toBeInTheDocument();
  });

  it('with unsubmitted edits asks first: cancel keeps everything, continue clears', async () => {
    const backend = await openReviewing();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '改过的名字' } });
    await userEvent.click(newChat());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /返\s?回/ }));
    expect(screen.getByLabelText('姓名')).toHaveValue('改过的名字');
    await userEvent.click(newChat());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '放弃修改并继续' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(writes(backend)).toEqual([]);
  });

  it('is disabled while a request is running', async () => {
    const hold = createGate();
    await openReviewing({ faults: [{ match: `PATCH /api/v1/sessions/${ID}/fields`, gate: hold.gate }] });
    await userEvent.click(screen.getByRole('button', { name: /确认本区|确认修改/ }));
    expect(newChat()).toBeDisabled();
    hold.open();
    await waitFor(() => expect(newChat()).toBeEnabled());
  });

  it('"上传下一份" on a saved session goes back to the empty view without a dialog', async () => {
    stubFetch(new FakeBackend({ sessions: [sampleSessionDetail('saved')] }).handle);
    render(<ResumeCollectionPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
    await userEvent.click(await screen.findByRole('button', { name: '上传下一份' }));
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
