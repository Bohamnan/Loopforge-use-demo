import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const SECRET = '测试用户甲 13800138000';

function Boom(): never {
  throw new Error(`render failed for ${SECRET}`);
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows a generic message without leaking the error content', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument();
    expect(container.textContent).not.toContain(SECRET);
    expect(container.textContent).not.toContain('render failed');
  });

  it('logs only the error name from the boundary itself (B-03)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const own = spy.mock.calls.filter((call) => call[0] === 'ErrorBoundary caught a render error:');
    expect(own).toHaveLength(1);
    expect(JSON.stringify(own[0])).not.toContain(SECRET);
    expect(own[0]?.[1]).toBe('Error');
  });

  it('reloads the page when the user clicks the button', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReload = vi.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: '刷新页面' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
