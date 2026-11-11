import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '../test/ApiMocks';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResumeCollectionPage start (REQ-FE-05, design 5.1)', () => {
  it('opens in the empty state without any request, error or console output (O-12)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = stubFetch(() => {
      throw new Error('no request expected');
    });
    render(
      <StrictMode>
        <ResumeCollectionPage />
      </StrictMode>,
    );
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('shows no user info, guide, privacy or sample-file entries', () => {
    render(<ResumeCollectionPage />);
    expect(screen.queryByText(/填写指南|隐私说明|示例文件/)).not.toBeInTheDocument();
    expect(document.querySelector('.avatar')).toBeNull();
  });
});
