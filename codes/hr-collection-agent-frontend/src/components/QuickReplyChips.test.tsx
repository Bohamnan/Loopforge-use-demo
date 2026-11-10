import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuickReplyChips from './QuickReplyChips';

describe('QuickReplyChips', () => {
  it('renders one button per chip and runs the matching action only', async () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <QuickReplyChips
        chips={[
          { label: '确认无误', onClick: a, primary: true },
          { label: '其余都没问题', onClick: b },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '其余都没问题' }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it('disables chips individually and renders no text input', () => {
    const { container } = render(<QuickReplyChips chips={[{ label: '确认无误', onClick: () => undefined, disabled: true }]} />);
    expect(screen.getByRole('button', { name: '确认无误' })).toBeDisabled();
    expect(container.querySelector('input, textarea')).toBeNull();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<QuickReplyChips chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
