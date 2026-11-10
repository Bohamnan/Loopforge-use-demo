import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { focusKeyOf, useChatScroll } from './useChatScroll';

describe('focusKeyOf: which block should get scroll + focus', () => {
  it('is the active section while reviewing the sections', () => {
    expect(focusKeyOf({ phase: 'reviewing', view: 'sections', activeSection: 'work' })).toBe('section:work');
  });
  it('is the final card in the final view', () => {
    expect(focusKeyOf({ phase: 'reviewing', view: 'final', activeSection: 'work' })).toBe('final');
  });
  it('is the result card once saved', () => {
    expect(focusKeyOf({ phase: 'saved', view: 'sections', activeSection: 'basic' })).toBe('saved');
  });
  it.each(['bootstrapping', 'bootstrap_failed', 'empty'] as const)('is nothing in %s', (phase) => {
    expect(focusKeyOf({ phase, view: 'sections', activeSection: 'basic' })).toBeNull();
  });
});

describe('useChatScroll', () => {
  it('only returns a key (a signal); it touches no DOM', () => {
    const { result, rerender } = renderHook((p: Parameters<typeof useChatScroll>[0]) => useChatScroll(p), {
      initialProps: { phase: 'reviewing', view: 'sections', activeSection: 'basic' } as Parameters<typeof useChatScroll>[0],
    });
    expect(result.current).toBe('section:basic');
    rerender({ phase: 'reviewing', view: 'sections', activeSection: 'intent' });
    expect(result.current).toBe('section:intent');
  });
});
