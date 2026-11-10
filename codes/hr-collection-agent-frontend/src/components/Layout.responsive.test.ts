import { describe, expect, it } from 'vitest';
import css from './Layout.css?raw';

/** Body of the `@media (max-width: <px>px)` block, found by brace matching. jsdom does not apply CSS, so rules are checked as text. */
function mediaBlock(maxWidth: number): string {
  const start = css.indexOf(`@media (max-width: ${maxWidth}px)`);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return '';
}

/** Declarations of the first rule whose selector list contains `selector` inside `block`. */
function rule(block: string, selector: string): string {
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(pattern)) {
    const selectors = (match[1] ?? '').split(',').map((s) => s.trim());
    if (selectors.includes(selector)) return match[2] ?? '';
  }
  return '';
}

const NARROW = 599;

describe('phone-width layout (integration drill SUGGEST-2)', () => {
  const block = mediaBlock(NARROW);

  it('has a phone-width block', () => {
    expect(block).not.toBe('');
  });

  it('stacks the label above an editable value so long phone numbers and emails get the full row', () => {
    expect(rule(block, '.field-edit')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(block, '.field-edit .field-label')).toMatch(/width:\s*100%/);
    expect(rule(block, '.field-edit .field-value')).toMatch(/flex:\s*1\s+1\s+\d+px/);
  });
});

describe('phone-width touch targets and composer height (integration drill SUGGEST-3)', () => {
  const block = mediaBlock(NARROW);

  it('makes every button at least 44x44 px', () => {
    const declarations = rule(block, 'button.ant-btn');
    expect(declarations).toMatch(/min-height:\s*44px/);
    expect(declarations).toMatch(/min-width:\s*44px/);
  });

  it('drops the format hint in the composer so the bar does not grow with the larger buttons', () => {
    expect(rule(block, '.composer-hint')).toMatch(/display:\s*none/);
  });

  it('keeps wider layouts untouched: the 44px rule lives only inside the phone-width block', () => {
    expect(css.replace(block, '')).not.toMatch(/min-height:\s*44px/);
  });
});
