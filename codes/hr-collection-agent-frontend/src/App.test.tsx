import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App, { appTheme } from './App';
import { stubFetch } from './test/ApiMocks';
import { FakeBackend } from './test/FakeBackend';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the page shell inside the error boundary', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'HR 简历信息收集' })).toBeInTheDocument();
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('uses the prototype palette as Ant Design theme tokens (TD-14)', () => {
    expect(appTheme.token).toMatchObject({
      colorPrimary: '#126af3',
      colorSuccess: '#1a7f4b',
      colorWarning: '#b26a00',
      colorError: '#dd0028',
      colorText: '#0c1217',
      colorBgLayout: '#f3f5f7',
    });
  });

  it('switches views with the navigation; the archive is only requested when it is opened (REQ-FE-08.1, 08.2)', async () => {
    const backend = new FakeBackend();
    stubFetch(backend.handle);
    render(<App />);
    expect(screen.getAllByText('已归档简历')[0]).toBeInTheDocument();
    expect(backend.count('GET /api/v1/resumes')).toBe(0);
    await userEvent.click(screen.getAllByText('已归档简历')[0]!);
    expect(await screen.findByText('暂无记录')).toBeInTheDocument();
    expect(backend.count('GET /api/v1/resumes')).toBe(1);
    await userEvent.click(screen.getAllByText('对话')[0]!);
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('keeps both pages mounted: an unsubmitted edit and the uploaded session survive a round trip to the archive (TD-25)', async () => {
    const backend = new FakeBackend();
    stubFetch(backend.handle);
    const { container } = render(<App />);
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
