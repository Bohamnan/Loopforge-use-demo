import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleChatMessage, sampleSessionDetail, sampleSuggestion, stubFetch } from '../test/ApiMocks';
import { FakeBackend } from '../test/FakeBackend';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('opening a saved session (REQ-FE-05.3)', () => {
  it('shows the record and a read-only conversation: no apply / cancel, chat closed, no contact data in console', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const messages = [
      sampleChatMessage('user', '岗位改成采购总监'),
      sampleChatMessage('assistant', '建议如下', { suggestions: [sampleSuggestion({ status: 'applied', old_value: null })] }),
    ];
    stubFetch(new FakeBackend({ sessions: [sampleSessionDetail('saved', { messages })] }).handle);
    render(<ResumeCollectionPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^简历 · 测试用户甲/ }));
    expect(await screen.findByText('建议如下')).toBeInTheDocument();
    expect(screen.getByText('13800138000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^应\s?用$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '对话输入' })).toHaveAttribute('placeholder', '已保存的会话不能再对话');
    const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('13800138000');
    expect(logged).not.toContain('test.user@example.com');
  });
});
