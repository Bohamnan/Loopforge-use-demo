import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SavedResultCard, { formatSavedAt } from './SavedResultCard';

const summary = { name: '测试用户甲', filename: '合成简历.pdf', saved_at: '2026-11-10T09:00:00Z' };

describe('SavedResultCard', () => {
  it('shows "已保存" with exactly the name, the original file name and the saved time (P-09)', () => {
    render(<SavedResultCard summary={summary} alreadySaved={false} onUploadNext={() => undefined} />);
    expect(screen.getByTestId('saved-result')).toBeInTheDocument();
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(screen.getByText('测试用户甲')).toBeInTheDocument();
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
    expect(screen.getByText(formatSavedAt(summary.saved_at))).toBeInTheDocument();
    expect(screen.queryByText(/记录编号|RS-|resume_id/)).not.toBeInTheDocument();
  });

  it('offers "上传下一份" and calls the handler', async () => {
    const onUploadNext = vi.fn();
    render(<SavedResultCard summary={summary} alreadySaved={false} onUploadNext={onUploadNext} />);
    await userEvent.click(screen.getByRole('button', { name: '上传下一份' }));
    expect(onUploadNext).toHaveBeenCalledTimes(1);
  });

  it('for an already saved resume shows only the text, with no record content (D-04)', () => {
    render(<SavedResultCard summary={summary} alreadySaved onUploadNext={() => undefined} />);
    expect(screen.getByText('该简历已保存过')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-result')).not.toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    expect(screen.queryByText('测试用户甲')).not.toBeInTheDocument();
    expect(screen.queryByText('合成简历.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传下一份' })).toBeInTheDocument();
  });

  it('formats the saved time in a readable local form that keeps the year', () => {
    expect(formatSavedAt('2026-11-10T09:00:00Z')).toMatch(/2026/);
    expect(formatSavedAt('not a date')).toBe('not a date');
  });
});
