import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

describe('AppShell', () => {
  it('renders the product title, the new-chat button and the content', () => {
    render(
      <AppShell onNewChat={() => undefined}>
        <p>主体内容</p>
      </AppShell>,
    );
    expect(screen.getByRole('heading', { name: 'HR 简历信息收集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新对话/ })).toBeInTheDocument();
    expect(screen.getByText('主体内容')).toBeInTheDocument();
  });

  it('has no user info, history list, guide, privacy link or review bar (P-02, P-11)', () => {
    const { container } = render(
      <AppShell>
        <span />
      </AppShell>,
    );
    expect(container.querySelector('.avatar')).toBeNull();
    expect(screen.queryByText(/历史|填写指南|隐私说明|示例文件|评审/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('disables the new-chat button when asked and forwards clicks otherwise', async () => {
    const onNewChat = vi.fn();
    const { rerender } = render(
      <AppShell onNewChat={onNewChat}>
        <span />
      </AppShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: /新对话/ }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    rerender(
      <AppShell onNewChat={onNewChat} newChatDisabled>
        <span />
      </AppShell>,
    );
    expect(screen.getByRole('button', { name: /新对话/ })).toBeDisabled();
  });
});
