import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { getSection } from '../hooks/model/SectionConfig';
import ObjectListEditor from './ObjectListEditor';

function Harness() {
  const [value, setValue] = useState<Record<string, unknown>[]>([{ company: '甲' }, { company: '乙' }, { company: '丙' }]);
  return (
    <ObjectListEditor field={getSection('work').fields[0]!} status="recognized" dirty={false} disabled={false} errors={{}} value={value} onChange={setValue} />
  );
}
const cards = () => Array.from(document.querySelectorAll('[data-item]')) as HTMLElement[];

describe('ObjectListEditor row identity (items have no id)', () => {
  it('keeps the DOM of the remaining items when one is deleted from the middle, so a collapsed card stays collapsed', async () => {
    render(<Harness />);
    const [first, second, third] = cards();
    (third as HTMLDetailsElement).open = false; // the user collapsed the third card
    await userEvent.click(within(second!).getByRole('button', { name: /删除这一条/ }));
    const after = cards();
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(first);
    expect(after[1]).toBe(third);
    expect((after[1] as HTMLDetailsElement).open).toBe(false);
    expect(within(after[1]!).getByLabelText('公司名称')).toHaveValue('丙');
  });

  it('a newly added card is a new element and the others are untouched', async () => {
    render(<Harness />);
    const before = cards();
    await userEvent.click(screen.getByRole('button', { name: /添加一条/ }));
    const after = cards();
    expect(after).toHaveLength(4);
    expect(after.slice(0, 3)).toEqual(before);
  });
});
