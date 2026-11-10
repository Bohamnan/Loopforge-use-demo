import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

function mockViewport(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query.includes('max-width: 859px'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  }));
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: globalThis.matchMedia });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell responsiveness (TD-13)', () => {
  it('wide screens: new chat lives in the side bar', () => {
    mockViewport(false);
    const { container } = render(<AppShell><span /></AppShell>);
    expect(container.querySelector('.app-sidebar')).not.toBeNull();
    expect(within(container.querySelector('.app-sidebar') as HTMLElement).getByRole('button', { name: /新对话/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /新对话/ })).toHaveLength(1);
  });

  it('below 860px the side bar folds away and new chat moves to the title bar, still reachable', () => {
    mockViewport(true);
    const { container } = render(<AppShell><span /></AppShell>);
    expect(container.querySelector('.app-sidebar')).toBeNull();
    const header = container.querySelector('.app-header') as HTMLElement;
    expect(within(header).getByRole('button', { name: /新对话/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /新对话/ })).toHaveLength(1);
  });

  it('labels its landmarks', () => {
    mockViewport(false);
    render(<AppShell><span /></AppShell>);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '会话操作' })).toBeInTheDocument();
  });
});
