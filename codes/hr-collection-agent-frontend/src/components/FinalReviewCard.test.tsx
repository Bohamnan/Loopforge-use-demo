import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import { sampleFields } from '../test/ApiMocks';
import FinalReviewCard from './FinalReviewCard';

function setup(props: Partial<React.ComponentProps<typeof FinalReviewCard>> = {}) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  const onEditCore = vi.fn();
  const utils = render(
    <FinalReviewCard
      fields={sampleFields()}
      buffer={{}}
      unconfirmedCount={0}
      coreReady
      busy={false}
      error={null}
      onConfirm={onConfirm}
      onBack={onBack}
      onEditCore={onEditCore}
      {...props}
    />,
  );
  return { onConfirm, onBack, onEditCore, ...utils };
}

describe('FinalReviewCard', () => {
  it('shows the full result read-only: all 22 fields, no inputs, no "已保存" (F-03)', () => {
    setup();
    expect(document.querySelectorAll('[data-field]')).toHaveLength(22);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/已保存/)).not.toBeInTheDocument();
    expect(screen.getByText('13800138000')).toBeInTheDocument();
  });

  it('never presents a recognized field as confirmed', () => {
    setup();
    const phone = document.querySelector('[data-field="phone"]') as HTMLElement;
    expect(phone).toHaveTextContent('待确认');
    expect(phone).not.toHaveTextContent('已确认');
  });

  it('enables "确认提交" when the core fields are ready and calls onConfirm', async () => {
    const { onConfirm } = setup();
    const button = screen.getByRole('button', { name: '确认提交' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables "确认提交" and says why when the core fields are not ready (D-03)', async () => {
    const { onConfirm, onEditCore } = setup({ coreReady: false });
    expect(screen.getByRole('button', { name: '确认提交' })).toBeDisabled();
    expect(screen.getByText(/请先确认姓名、手机号、邮箱/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /去确认基本信息/ }));
    expect(onEditCore).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('offers no way to the core section when it is ready', () => {
    setup();
    expect(screen.queryByRole('button', { name: /去确认基本信息/ })).not.toBeInTheDocument();
  });

  it('points out unconfirmed fields only when there are some', () => {
    const { unmount } = setup({ unconfirmedCount: 5 });
    expect(screen.getByText(/还有 5 项字段未确认/)).toBeInTheDocument();
    unmount();
    setup({ unconfirmedCount: 0 });
    expect(screen.queryByText(/项字段未确认/)).not.toBeInTheDocument();
  });

  it('announces the unconfirmed-fields hint politely instead of as an alert, and marks the heading as a focus target', () => {
    setup({ unconfirmedCount: 3 });
    expect(screen.getByRole('status')).toHaveTextContent('还有 3 项字段未确认');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最终确认' })).toHaveAttribute('data-focus-key', 'final');
  });

  it('goes back through "我还要修改"', async () => {
    const { onBack } = setup();
    await userEvent.click(screen.getByRole('button', { name: '我还要修改' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('locks both buttons while the request is in flight', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: /确认提交/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '我还要修改' })).toBeDisabled();
  });

  it('after a failure shows the error, says the result is unknown, and keeps retry available (C-05)', async () => {
    const { onConfirm } = setup({ error: ApiError.timeout() });
    expect(screen.getByRole('alert')).toHaveTextContent('未收到保存结果');
    expect(screen.getByText(/不能确认是否已保存/)).toBeInTheDocument();
    // honest about the possible outcomes: retrying may succeed, or report that the draft is gone (maybe saved)
    expect(screen.getByText(/再试一次/)).toBeInTheDocument();
    expect(screen.getByText(/可能已经保存，请重新上传核实/)).toBeInTheDocument();
    expect(screen.queryByText(/不会产生重复记录/)).not.toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '确认提交' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the backend message for backend errors', () => {
    setup({ error: new ApiError({ code: 'save_failed', message: '保存失败，请重试。', status: 500, request_id: 'req_s1' }) });
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试。');
    expect(screen.getByRole('alert')).toHaveTextContent('req_s1');
  });
});
