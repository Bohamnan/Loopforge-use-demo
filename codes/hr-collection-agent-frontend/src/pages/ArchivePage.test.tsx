import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { SAMPLE_RESUME_ID, sampleArchivedResume, stubFetch } from '../test/ApiMocks';
import { FakeBackend, type FakeBackendOptions } from '../test/FakeBackend';
import ArchivePage from './ArchivePage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(options: FakeBackendOptions = { resumes: [sampleArchivedResume()] }) {
  const backend = new FakeBackend(options);
  stubFetch(backend.handle);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <ArchivePage active />
    </ConfigProvider>,
  );
  return backend;
}

describe('archive list and detail (REQ-FE-08.2, 08.3)', () => {
  it('lists name, phone, email and job intention, never the record id; empty list says "暂无记录"', async () => {
    setup();
    expect(await screen.findByRole('button', { name: '测试用户甲' })).toBeInTheDocument();
    expect(screen.getByText('13800138000')).toBeInTheDocument();
    expect(screen.getByText('供应链经理')).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_RESUME_ID)).not.toBeInTheDocument();
  });

  it('shows "暂无记录" when nothing is archived', async () => {
    setup({ resumes: [] });
    expect(await screen.findByText('暂无记录')).toBeInTheDocument();
  });

  it('opens the detail read-only with file name and saved time; empty values as "未填写"', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: '测试用户甲' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('合成简历.pdf')).toBeInTheDocument();
    expect(within(drawer).getAllByText('未填写').length).toBeGreaterThan(0);
    expect(within(drawer).queryByText(/待补充|待确认/)).not.toBeInTheDocument();
  });
});

describe('original file (REQ-FE-08.4, TD-27)', () => {
  it('downloads with a generic file name and releases the object URL; no contact data in console or title', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: '测试用户甲' }));
    await userEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /打开原始文件/ }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:x'));
    expect(names).toEqual(['原始简历.pdf']);
    const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls)) + document.title;
    expect(logged).not.toContain('测试用户甲');
    expect(logged).not.toContain('13800138000');
  });

  it('disables the button with a hint when the file is not available', async () => {
    setup({ resumes: [sampleArchivedResume({ file_available: false })] });
    await userEvent.click(await screen.findByRole('button', { name: '测试用户甲' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('button', { name: /打开原始文件/ })).toBeDisabled();
    expect(within(drawer).getByText('原始文件暂不可用')).toBeInTheDocument();
  });
});

describe('App: two pages stay mounted (REQ-FE-08.1, TD-25)', () => {
  it('switching to the archive and back keeps the chat page state (unsubmitted edit); the archive re-reads on activation', async () => {
    const backend = new FakeBackend();
    stubFetch(backend.handle);
    const { container } = render(<App />);
    expect(backend.count('GET /api/v1/resumes')).toBe(0);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], '合成简历.pdf', { type: 'application/pdf' }));
    await userEvent.clear(await screen.findByLabelText('姓名'));
    await userEvent.type(screen.getByLabelText('姓名'), '改过的名字');
    await userEvent.click(screen.getAllByText('已归档简历')[0]!);
    expect(await screen.findByText('暂无记录')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('对话')[0]!);
    expect(screen.getByLabelText('姓名')).toHaveValue('改过的名字');
    await userEvent.click(screen.getAllByText('已归档简历')[0]!);
    await waitFor(() => expect(backend.count('GET /api/v1/resumes')).toBe(2));
  });
});
