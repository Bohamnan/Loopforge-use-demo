import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NoticeBanner from './NoticeBanner';

describe('NoticeBanner', () => {
  it.each([
    ['restored', '已为你恢复未完成的简历'],
    ['draft_expired', '草稿已失效，请重新上传简历'],
    ['maybe_saved', '可能已保存，请重新上传核实'],
  ] as const)('shows the text for %s', (kind, text) => {
    render(<NoticeBanner kind={kind} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('lets the user close the restored notice only', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<NoticeBanner kind="restored" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<NoticeBanner kind="maybe_saved" onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});

describe('NoticeBanner kinds', () => {
  it('has no entry for already_saved: that sentence is shown by the result card only', () => {
    // @ts-expect-error already_saved is intentionally not a banner kind
    render(<NoticeBanner kind="already_saved" />);
    expect(screen.queryByText('该简历已保存过')).not.toBeInTheDocument();
  });
});
