import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NoticeBanner from './NoticeBanner';

describe('NoticeBanner', () => {
  it('shows the session_gone text as an alert and can be closed', async () => {
    const onClose = vi.fn();
    render(<NoticeBanner kind="session_gone" onClose={onClose} />);
    expect(screen.getByRole('alert')).toHaveTextContent('该会话已不存在');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
