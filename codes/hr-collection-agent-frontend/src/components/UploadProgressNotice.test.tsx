import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UploadProgressNotice from './UploadProgressNotice';

describe('UploadProgressNotice', () => {
  it('shows one status message with no steps or elapsed time (P-05)', () => {
    render(<UploadProgressNotice />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('正在识别，最长约 1 分钟');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.textContent).not.toMatch(/读取文件|提取文字|用时|秒/);
  });
});
