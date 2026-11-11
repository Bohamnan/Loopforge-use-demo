import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sampleSessionDetail } from '../test/ApiMocks';
import type { SavedView } from '../hooks/model/SessionReducer';
import SavedSessionView from './SavedSessionView';

const savedView = (kind: 'saved' | 'pending' | 'applied'): SavedView => {
  const d = sampleSessionDetail(kind);
  return { resume: d.resume!, update_state: d.update_state, update_candidate: d.update_candidate };
};
const props = { summary: null, busy: false, onUploadNext: () => undefined, onReread: () => undefined };

describe('SavedSessionView (REQ-FE-04.4, 04.5, 05.3)', () => {
  it('saved/none: result card from the record, all values read-only without statuses, empty as "未填写"', () => {
    render(<SavedSessionView kind="saved" saved={savedView('saved')} {...props} />);
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(screen.getAllByText('测试用户甲').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-field]')).toHaveLength(22);
    expect(screen.queryByText(/待补充|待确认|不确定/)).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-field="gender"]') as HTMLElement).getByText('未填写')).toBeInTheDocument();
    expect(screen.queryByText('已按本次内容更新')).not.toBeInTheDocument();
  });

  it('saved/pending: "该简历已保存过" with the existing record below, never "已保存"', () => {
    render(<SavedSessionView kind="already_saved" saved={savedView('pending')} {...props} />);
    expect(screen.getByText('该简历已保存过')).toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-field="job_title"]') as HTMLElement).getByText('供应链经理')).toBeInTheDocument();
  });

  it('saved/applied: a static "已按本次内容更新" line, no "已更新" result (TD-24)', () => {
    render(<SavedSessionView kind="saved" saved={savedView('applied')} {...props} />);
    expect(screen.getByText('已按本次内容更新')).toBeInTheDocument();
    expect(screen.queryByText('已更新')).not.toBeInTheDocument();
  });

  it('re-read failed: only the result card and "重新读取"', async () => {
    const onReread = vi.fn();
    render(<SavedSessionView kind="saved" saved={null} {...props} summary={{ name: '测试用户甲', filename: 'a.pdf', saved_at: '2026-11-10T09:00:00Z' }} onReread={onReread} />);
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(0);
    screen.getByRole('button', { name: /重新读取/ }).click();
    expect(onReread).toHaveBeenCalledTimes(1);
  });
});
