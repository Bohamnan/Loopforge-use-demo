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
});
