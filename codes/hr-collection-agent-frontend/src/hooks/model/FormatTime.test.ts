import { describe, expect, it } from 'vitest';
import { formatDateTime } from './FormatTime';

describe('formatDateTime', () => {
  it('formats a valid ISO time and returns null for garbage', () => {
    expect(formatDateTime('2026-11-10T09:00:00Z')).toMatch(/2026/);
    expect(formatDateTime('not a date')).toBeNull();
  });
});
