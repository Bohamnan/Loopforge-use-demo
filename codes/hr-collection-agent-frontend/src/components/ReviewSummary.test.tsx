import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleFields } from '../test/ApiMocks';
import ReviewSummary from './ReviewSummary';

describe('ReviewSummary', () => {
  it('shows the count of every status over the 22 fields', () => {
    render(<ReviewSummary fields={sampleFields()} onJump={() => undefined} />);
    const text = screen.getByTestId('review-summary-counts').textContent ?? '';
    expect(text).toContain('共 22 项');
    expect(text).toMatch(/待确认 \d+/);
    expect(text).toMatch(/不确定 \d+/);
    expect(text).toMatch(/待补充 \d+/);
    expect(text).toMatch(/已确认 \d+/);
  });

  it('offers a jump chip only for sections with missing or uncertain fields', async () => {
    const onJump = vi.fn();
    render(<ReviewSummary fields={sampleFields()} onJump={onJump} />);
    expect(screen.getByRole('button', { name: /基本信息/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /求职意向/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /专业技能/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ }));
    expect(onJump).toHaveBeenCalledWith('intent');
  });
});
