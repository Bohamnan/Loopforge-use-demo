import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="标题" content="内容" okText="继续上传" onOk={() => undefined} onCancel={() => undefined} />);
    expect(screen.queryByText('标题')).not.toBeInTheDocument();
  });

  it('shows title and content and wires both buttons', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="覆盖当前草稿" content="将覆盖未确认的内容" okText="继续上传" onOk={onOk} onCancel={onCancel} />);
    expect(screen.getByText('覆盖当前草稿')).toBeInTheDocument();
    expect(screen.getByText('将覆盖未确认的内容')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '继续上传' }));
    expect(onOk).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /取\s?消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('supports a custom cancel label', () => {
    render(<ConfirmDialog open title="t" content="c" okText="放弃修改并继续" cancelText="返回" onOk={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole('button', { name: /返\s?回/ })).toBeInTheDocument();
  });
});
