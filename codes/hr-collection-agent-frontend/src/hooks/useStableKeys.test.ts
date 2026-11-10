import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useStableKeys } from './useStableKeys';

/** Mimics an editor: the parent list length and the key list change in the same event. */
function useEditor(initial: number) {
  const [length, setLength] = useState(initial);
  const stable = useStableKeys(length);
  return { ...stable, length, setLength };
}

describe('useStableKeys (list items have no id, so rows get their own)', () => {
  it('gives every row a distinct key', () => {
    const { result } = renderHook(() => useStableKeys(3));
    expect(new Set(result.current.keys).size).toBe(3);
  });

  it('keeps the keys of the remaining rows when one is removed from the middle', () => {
    const { result } = renderHook(() => useEditor(3));
    const [a, , c] = result.current.keys;
    act(() => {
      result.current.remove(1);
      result.current.setLength(2);
    });
    expect(result.current.keys).toEqual([a, c]);
  });

  it('appends a fresh key when a row is added and keeps the others', () => {
    const { result } = renderHook(() => useEditor(1));
    const [a] = result.current.keys;
    act(() => {
      result.current.add();
      result.current.setLength(2);
    });
    expect(result.current.keys[0]).toBe(a);
    expect(result.current.keys[1]).not.toBe(a);
    expect(result.current.keys).toHaveLength(2);
  });

  it('starts over when the list length changes from outside (a new draft arrived)', () => {
    const { result } = renderHook(() => useEditor(2));
    const before = result.current.keys;
    act(() => result.current.setLength(4));
    expect(result.current.keys).toHaveLength(4);
    expect(result.current.keys.some((k) => before.includes(k))).toBe(false);
  });
});
