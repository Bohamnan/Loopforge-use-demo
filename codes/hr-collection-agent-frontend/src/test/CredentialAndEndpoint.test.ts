import { describe, expect, it } from 'vitest';

// F-01: production code holds no credentials and names no external endpoint; it reaches the backend only through src/api.
// Vite loads every production source file as raw text, so no Node built-ins are needed (tsconfig has no Node types).
const SOURCES = import.meta.glob<string>(
  ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../**/*.d.ts', '!../test/**'],
  { query: '?raw', import: 'default', eager: true },
);

const FORBIDDEN = {
  'credential literal': /sk-[A-Za-z0-9]{8,}|deepseek|api[_-]?key|\bBearer\s|\bsecret\b|\bpassword\b/i,
  'absolute external URL': /https?:\/\//i,
  'cookie access': /document\.cookie/,
};

describe('F-01 no credentials and no external endpoints in production code', () => {
  const files = Object.entries(SOURCES);

  it('scans the production source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('positive control: the credential pattern does match a planted key', () => {
    expect(FORBIDDEN['credential literal'].test("const key = 'sk-abcdef123456';")).toBe(true);
  });

  it.each(Object.entries(FORBIDDEN))('has no %s', (_label, pattern) => {
    const hits = files.filter(([, content]) => pattern.test(content)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
