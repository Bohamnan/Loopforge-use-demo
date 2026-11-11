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
  it.each(['empty'] as const)('is nothing in %s', (phase) => {
    expect(focusKeyOf({ phase, view: 'sections', activeSection: 'basic' })).toBeNull();
  });
});

describe('focusKeyOf: chat and diff targets (TD-31)', () => {
  const base = { phase: 'reviewing', view: 'sections', activeSection: 'basic', lastMessageId: 'm1' } as const;
  it('a new message is the target, with a token so a second new message is a new signal', () => {
    expect(focusKeyOf({ ...base, lastMessageId: 'm2' }, base)).toBe('message:last#m2');
    expect(focusKeyOf({ ...base, lastMessageId: 'm3' }, { ...base, lastMessageId: 'm2' })).toBe('message:last#m3');
  });
  it('opening a session with history focuses the section, not a message', () => {
    expect(focusKeyOf({ ...base, lastMessageId: 'm9' }, { ...base, phase: 'empty', lastMessageId: null })).toBe('section:basic');
  });
  it('an opened diff card is the target in the saved view', () => {
    const saved = { ...base, phase: 'saved' } as const;
    expect(focusKeyOf({ ...saved, diffOpen: true }, saved)).toBe('update-diff');
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
