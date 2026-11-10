import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getSection } from '../hooks/model/SectionConfig';
import ObjectListEditor from './ObjectListEditor';

const fieldOf = (section: Parameters<typeof getSection>[0]) => getSection(section).fields[0]!;
const base = { status: 'recognized' as const, dirty: false, disabled: false, errors: {} };
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ company: `公司${i + 1}` }));
const card = (n: number) => document.querySelectorAll('[data-item]')[n] as HTMLElement;

describe('ObjectListEditor', () => {
  it('shows one card per item with all labelled sub-fields of the work experience schema', () => {
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={items(2)} onChange={() => undefined} />);
    expect(document.querySelectorAll('[data-item]')).toHaveLength(2);
    const first = within(card(0));
    for (const label of ['公司名称', '职位名称', '开始时间', '结束时间', '部门', '汇报对象', '团队规模']) {
      expect(first.getByLabelText(label)).toBeInTheDocument();
    }
    expect(first.getByText('工作职责')).toBeInTheDocument();
    expect(first.getByText('主要业绩')).toBeInTheDocument();
    expect(first.getByLabelText('公司名称')).toHaveValue('公司1');
  });

  it('uses the project and education sub-fields from the contract', () => {
    const { unmount } = render(<ObjectListEditor {...base} field={fieldOf('project')} value={[{}]} onChange={() => undefined} />);
    for (const label of ['项目名称', '开始时间', '结束时间', '项目背景', '我的角色', '技术 / 方法', '项目成果']) {
      expect(within(card(0)).getByLabelText(label)).toBeInTheDocument();
    }
    unmount();
    render(<ObjectListEditor {...base} field={fieldOf('education')} value={[{}]} onChange={() => undefined} />);
    for (const label of ['开始时间', '结束时间', '学校', '专业', '学历', '在校荣誉']) {
      expect(within(card(0)).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('edits a sub-field and reports the complete new list', async () => {
    const onChange = vi.fn();
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={[{ company: '甲', position: '主管' }, { company: '乙' }]} onChange={onChange} />);
    await userEvent.type(within(card(1)).getByLabelText('职位名称'), '专');
    expect(onChange).toHaveBeenLastCalledWith([{ company: '甲', position: '主管' }, { company: '乙', position: '专' }]);
  });

  it('adds an empty item at the end', async () => {
    const onChange = vi.fn();
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={items(1)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /添加一条/ }));
    expect(onChange).toHaveBeenCalledWith([{ company: '公司1' }, {}]);
  });

  it('deletes one item, and deleting the last gives []', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<ObjectListEditor {...base} field={fieldOf('work')} value={items(2)} onChange={onChange} />);
    await userEvent.click(within(card(0)).getByRole('button', { name: /删除这一条/ }));
    expect(onChange).toHaveBeenCalledWith([{ company: '公司2' }]);
    unmount();
    const onChange2 = vi.fn();
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={items(1)} onChange={onChange2} />);
    await userEvent.click(within(card(0)).getByRole('button', { name: /删除这一条/ }));
    expect(onChange2).toHaveBeenCalledWith([]);
  });

  it('edits a sub text list inside an item (responsibilities)', async () => {
    const onChange = vi.fn();
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={[{ company: '甲', responsibilities: ['负责采购'] }]} onChange={onChange} />);
    await userEvent.type(within(card(0)).getByDisplayValue('负责采购'), '!');
    expect(onChange).toHaveBeenLastCalledWith([{ company: '甲', responsibilities: ['负责采购!'] }]);
  });

  it('keeps blank rows of a sub list on blur; they are simply not submitted', () => {
    const onChange = vi.fn();
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={[{ company: '甲', achievements: ['成果A', ' '] }]} onChange={onChange} />);
    fireEvent.blur(within(card(0)).getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === ' ')!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an empty list as a placeholder with an add button', () => {
    render(<ObjectListEditor {...base} field={fieldOf('education')} value={[]} onChange={() => undefined} />);
    expect(screen.getByText('（未提供）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添加一条/ })).toBeEnabled();
  });

  it('stops adding at the 20 item limit of the contract', () => {
    render(<ObjectListEditor {...base} field={fieldOf('work')} value={items(20)} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /添加一条/ })).toBeDisabled();
    expect(screen.getByText(/最多 20 条/)).toBeInTheDocument();
  });

  it('stops adding to a sub list at 30 entries', () => {
    render(
      <ObjectListEditor
        {...base}
        field={fieldOf('work')}
        value={[{ responsibilities: Array.from({ length: 30 }, (_, i) => `职责${i}`) }]}
        onChange={() => undefined}
      />,
    );
    const add = within(card(0)).getAllByRole('button', { name: /添加一项/ })[0]!;
    expect(add).toBeDisabled();
  });

  it('shows reasons at the exact item and sub-field they refer to', () => {
    render(
      <ObjectListEditor
        {...base}
        field={fieldOf('work')}
        value={items(2)}
        errors={{ 'work_experiences[1].start_date': 'too_long', 'work_experiences[0].responsibilities[0]': 'too_long' }}
        onChange={() => undefined}
      />,
    );
    expect(within(card(1)).getByText('内容过长')).toBeInTheDocument();
    expect(within(card(0)).queryByText('内容过长')).not.toBeInTheDocument();
  });

  it('shows the list-level error and the status, and locks everything when disabled', () => {
    render(<ObjectListEditor {...base} disabled dirty field={fieldOf('work')} value={items(1)} errors={{ work_experiences: 'too_long' }} onChange={() => undefined} />);
    expect(screen.getByText('内容过长')).toBeInTheDocument();
    expect(screen.getByText('未提交修改')).toBeInTheDocument();
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: /添加一条/ })).toBeDisabled();
    expect(within(card(0)).getByRole('button', { name: /删除这一条/ })).toBeDisabled();
  });
});

describe('ObjectListEditor robustness', () => {
  it('does not throw for a null element (a title is only a convenience)', () => {
    expect(() =>
      render(<ObjectListEditor {...base} field={fieldOf('work')} value={[null as unknown as Record<string, unknown>]} onChange={() => undefined} />),
    ).not.toThrow();
  });
});
