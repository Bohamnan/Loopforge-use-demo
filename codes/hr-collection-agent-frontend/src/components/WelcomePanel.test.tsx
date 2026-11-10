import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WelcomePanel from './WelcomePanel';

describe('WelcomePanel', () => {
  it('invites the user to upload a resume', () => {
    render(<WelcomePanel />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('shows the upload button only when a handler is given and calls it', async () => {
    const { rerender } = render(<WelcomePanel />);
    expect(screen.queryByRole('button', { name: /上传简历/ })).not.toBeInTheDocument();
    const onUploadClick = vi.fn();
    rerender(<WelcomePanel onUploadClick={onUploadClick} />);
    await userEvent.click(screen.getByRole('button', { name: /上传简历/ }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('renders children (notices) above the invitation', () => {
    render(
      <WelcomePanel>
        <p>提示内容</p>
      </WelcomePanel>,
    );
    expect(screen.getByText('提示内容')).toBeInTheDocument();
  });

  it('has no guide, privacy statement or sample-file button (P-11)', () => {
    render(<WelcomePanel onUploadClick={() => undefined} />);
    expect(screen.queryByText(/填写指南|隐私说明|示例文件/)).not.toBeInTheDocument();
  });
});
