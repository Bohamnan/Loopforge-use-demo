import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StringListEditor from './StringListEditor';

const base = { label: '专业技能', fieldKey: 'skills' as const, status: 'recognized' as const, dirty: false, disabled: false, errors: {} };

describe('StringListEditor', () => {
  it('shows one input per item and the status', () => {
    render(<StringListEditor {...base} value={['Excel', 'SAP']} onChange={() => undefined} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByDisplayValue('Excel')).toBeInTheDocument();
    expect(screen.getByText('待确认')).toBeInTheDocument();
  });

  it('edits an item and reports the whole new list', async () => {
    const onChange = vi.fn();
    render(<StringListEditor {...base} value={['Excel']} onChange={onChange} />);
    await userEvent.type(screen.getByDisplayValue('Excel'), '!');
    expect(onChange).toHaveBeenLastCalledWith(['Excel!']);
  });

  it('adds an empty item', async () => {
    const onChange = vi.fn();
    render(<StringListEditor {...base} value={['Excel']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /添加一项/ }));
    expect(onChange).toHaveBeenCalledWith(['Excel', '']);
  });

  it('deletes an item, and a fully emptied list is []', async () => {
    const onChange = vi.fn();
    render(<StringListEditor {...base} value={['Excel']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('drops blank rows when an input loses focus', () => {
    const onChange = vi.fn();
    render(<StringListEditor {...base} value={['Excel', '  ', 'SAP']} onChange={onChange} />);
    fireEvent.blur(screen.getAllByRole('textbox')[1]!);
    expect(onChange).toHaveBeenCalledWith(['Excel', 'SAP']);
  });

  it('keeps non-blank rows on blur (no needless change)', () => {
    const onChange = vi.fn();
    render(<StringListEditor {...base} value={['Excel']} onChange={onChange} />);
    fireEvent.blur(screen.getByDisplayValue('Excel'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the placeholder hint for an empty list', () => {
    render(<StringListEditor {...base} value={[]} onChange={() => undefined} />);
    expect(screen.getByText('（未提供）')).toBeInTheDocument();
  });

  it('disables adding once the contract limit of 50 items is reached', () => {
    render(<StringListEditor {...base} value={Array.from({ length: 50 }, (_, i) => `技能${i}`)} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /添加一项/ })).toBeDisabled();
    expect(screen.getByText(/最多 50 项/)).toBeInTheDocument();
  });

  it('shows reasons for the whole list and for single items', () => {
    render(<StringListEditor {...base} value={['a', 'b']} onChange={() => undefined} errors={{ skills: 'too_long', 'skills[1]': 'too_long' }} />);
    expect(screen.getAllByText('内容过长').length).toBe(2);
  });

  it('disables inputs and buttons while busy', () => {
    render(<StringListEditor {...base} disabled value={['a']} onChange={() => undefined} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /添加一项/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled();
  });

  it('marks unsubmitted edits', () => {
    render(<StringListEditor {...base} dirty value={['a']} onChange={() => undefined} />);
    expect(screen.getByText('未提交修改')).toBeInTheDocument();
  });
});
