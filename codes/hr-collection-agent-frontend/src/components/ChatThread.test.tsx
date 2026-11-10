import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatThread from './ChatThread';

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  // @ts-expect-error restore the jsdom default (no scrollIntoView)
  delete Element.prototype.scrollIntoView;
});

describe('ChatThread', () => {
  it('scrolls to and focuses the block named by focusKey', () => {
    render(
      <ChatThread focusKey="section:intent">
        <h3 data-focus-key="section:basic" tabIndex={-1}>基本信息</h3>
        <h3 data-focus-key="section:intent" tabIndex={-1}>求职意向</h3>
      </ChatThread>,
    );
    expect(screen.getByRole('heading', { name: '求职意向' })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('moves focus again when the key changes, and not when it stays the same', () => {
    const tree = (key: string) => (
      <ChatThread focusKey={key}>
        <h3 data-focus-key="a" tabIndex={-1}>A</h3>
        <h3 data-focus-key="b" tabIndex={-1}>B</h3>
      </ChatThread>
    );
    const { rerender } = render(tree('a'));
    expect(screen.getByRole('heading', { name: 'A' })).toHaveFocus();
    rerender(tree('a'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    rerender(tree('b'));
    expect(screen.getByRole('heading', { name: 'B' })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a focus key or when the block is absent', () => {
    render(
      <ChatThread focusKey={null}>
        <p>content</p>
      </ChatThread>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
    render(<ChatThread focusKey="missing"><p>x</p></ChatThread>);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('works where scrollIntoView does not exist', () => {
    // @ts-expect-error simulate an environment without it
    delete Element.prototype.scrollIntoView;
    render(
      <ChatThread focusKey="a">
        <h3 data-focus-key="a" tabIndex={-1}>A</h3>
      </ChatThread>,
    );
    expect(screen.getByRole('heading', { name: 'A' })).toHaveFocus();
  });
});

describe('ChatThread motion preference (review batch 5 S2)', () => {
  function prefersReducedMotion(reduce: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
  }
  const tree = (
    <ChatThread focusKey="a">
      <h3 data-focus-key="a" tabIndex={-1}>A</h3>
    </ChatThread>
  );

  it('scrolls smoothly by default', () => {
    prefersReducedMotion(false);
    render(tree);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('scrolls without animation when the user asked for reduced motion', () => {
    prefersReducedMotion(true);
    render(tree);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });
});
