import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Verifies the red-line ESLint rules (F-02, B-03, layering) against in-memory code samples.
async function lint(code: string, filePath: string) {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

const rules = (messages: Awaited<ReturnType<typeof lint>>) => messages.map((m) => m.ruleId);

describe('ESLint red lines', () => {
  it.each(['localStorage', 'sessionStorage', 'indexedDB'])('forbids bare %s', async (name) => {
    const messages = await lint(`export const v = ${name};\n`, 'src/components/Sample.tsx');
    expect(rules(messages)).toContain('no-restricted-globals');
  });

  it.each(['window.localStorage', 'window.sessionStorage', 'window.indexedDB', 'globalThis.localStorage'])(
    'forbids %s',
    async (expr) => {
      const messages = await lint(`export const v = ${expr};\n`, 'src/hooks/useSample.ts');
      expect(rules(messages)).toContain('no-restricted-properties');
    },
  );

  it.each(['src/pages/Sample.tsx', 'src/components/Sample.tsx', 'src/hooks/useSample.ts'])(
    'forbids fetch in %s',
    async (path) => {
      const messages = await lint(`export const v = () => fetch('/x');\n`, path);
      expect(rules(messages)).toContain('no-restricted-globals');
    },
  );

  it('forbids window.fetch in components', async () => {
    const messages = await lint(`export const v = () => window.fetch('/x');\n`, 'src/components/Sample.tsx');
    expect(rules(messages)).toContain('no-restricted-properties');
  });

  it('allows fetch inside src/api', async () => {
    const messages = await lint(`export const v = () => fetch('/x');\n`, 'src/api/Sample.ts');
    expect(rules(messages)).not.toContain('no-restricted-globals');
  });

  it('warns on console.log but allows console.error', async () => {
    const bad = await lint(`console.log('x');\n`, 'src/api/Sample.ts');
    expect(rules(bad)).toContain('no-console');
    const ok = await lint(`console.error('x');\n`, 'src/api/Sample.ts');
    expect(rules(ok)).not.toContain('no-console');
  });

  it.each(['src/App.tsx', 'src/main.tsx', 'src/types/Sample.ts', 'src/hooks/model/Sample.ts'])('forbids fetch in %s too (F-01 beyond the three layers)', async (path) => {
    const messages = await lint(`export const v = () => fetch('/x');\n`, path);
    expect(rules(messages)).toContain('no-restricted-globals');
  });

  it.each([
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('ws://x')", 'no-restricted-globals'],
    ["new EventSource('/x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('/x', 'y')", 'no-restricted-properties'],
    ["window.WebSocket", 'no-restricted-properties'],
  ])('forbids %s outside src/api', async (expr, rule) => {
    const messages = await lint(`export const v = ${expr};\n`, 'src/components/Sample.tsx');
    expect(rules(messages)).toContain(rule);
  });

  it('keeps the network allowed inside src/api and in tests', async () => {
    const code = `export const v = () => [fetch('/x'), new XMLHttpRequest()];\n`;
    expect(rules(await lint(code, 'src/api/Sample.ts'))).not.toContain('no-restricted-globals');
    expect(rules(await lint(code, 'src/components/Sample.test.tsx'))).not.toContain('no-restricted-globals');
    expect(rules(await lint(code, 'src/test/Helper.ts'))).not.toContain('no-restricted-globals');
  });

  it('still forbids browser storage everywhere, including src/api and tests', async () => {
    for (const path of ['src/api/Sample.ts', 'src/components/Sample.test.tsx']) {
      expect(rules(await lint(`export const v = localStorage;\n`, path))).toContain('no-restricted-globals');
    }
  });
});
