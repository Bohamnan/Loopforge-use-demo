import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '../test/ApiMocks';
import { FakeBackend } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResumeCollectionPage start (REQ-FE-05, design 5.1)', () => {
  it('opens in the empty state; the only request is the session list, no error, no console output (O-12)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const backend = new FakeBackend();
    stubFetch(backend.handle);
    render(
      <StrictMode>
        <ResumeCollectionPage />
      </StrictMode>,
    );
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
    expect(await screen.findByText('暂无历史会话')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(new Set(backend.requests)).toEqual(new Set(['GET /api/v1/sessions']));
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('shows no user info, guide, privacy or sample-file entries', () => {
    render(<ResumeCollectionPage />);
    expect(screen.queryByText(/填写指南|隐私说明|示例文件/)).not.toBeInTheDocument();
    expect(document.querySelector('.avatar')).toBeNull();
  });
});
