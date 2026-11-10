import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import BootstrapErrorPanel from './BootstrapErrorPanel';

describe('BootstrapErrorPanel', () => {
  it('shows the error and a retry button that calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<BootstrapErrorPanel error={ApiError.network()} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('网络异常');
    await userEvent.click(screen.getByRole('button', { name: /重\s?试/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('explains why the page cannot continue and offers no upload entry', () => {
    render(<BootstrapErrorPanel error={ApiError.unknown(502)} onRetry={() => undefined} />);
    expect(screen.getByText(/未能读取已有草稿/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上传/ })).not.toBeInTheDocument();
  });
});
