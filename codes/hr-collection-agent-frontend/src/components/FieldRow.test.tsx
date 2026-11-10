import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getSection } from '../hooks/model/SectionConfig';
import FieldRow from './FieldRow';

const field = (section: Parameters<typeof getSection>[0], key: string) => getSection(section).fields.find((f) => f.key === key)!;
const base = { onChange: () => undefined, dirty: false, disabled: false };

describe('FieldRow', () => {
  it('shows the label, the value in an input, and the status', () => {
    render(<FieldRow {...base} field={field('basic', 'phone')} status="recognized" value="13800138000" />);
    expect(screen.getByLabelText('手机号')).toHaveValue('13800138000');
    expect(screen.getByText('待确认')).toBeInTheDocument();
  });

  it('shows null as an empty input', () => {
    render(<FieldRow {...base} field={field('basic', 'homepage')} status="missing" value={null} />);
    expect(screen.getByLabelText('个人主页')).toHaveValue('');
    expect(screen.getByText('待补充')).toBeInTheDocument();
  });

  it('reports every change with the new text', async () => {
    const onChange = vi.fn();
    render(<FieldRow {...base} onChange={onChange} field={field('intent', 'job_title')} status="recognized" value="" />);
    await userEvent.type(screen.getByLabelText('意向岗位'), 'ab');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('uses a multi-line input for textarea fields', () => {
    const { container } = render(<FieldRow {...base} field={field('self_evaluation', 'self_evaluation')} status="missing" value={null} />);
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('can be disabled', () => {
    render(<FieldRow {...base} disabled field={field('intent', 'job_title')} status="recognized" value="x" />);
    expect(screen.getByLabelText('意向岗位')).toBeDisabled();
  });

  it('marks unsubmitted edits without changing the status', () => {
    render(<FieldRow {...base} dirty field={field('intent', 'job_title')} status="recognized" value="x" />);
    expect(screen.getByText('未提交修改')).toBeInTheDocument();
    expect(screen.getByText('待确认')).toBeInTheDocument();
  });

  it('validates phone and email after the user leaves the field', () => {
    const { rerender } = render(<FieldRow {...base} field={field('basic', 'phone')} status="recognized" value="123" />);
    expect(screen.queryByText('格式不正确')).not.toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText('手机号'));
    expect(screen.getByText('格式不正确')).toBeInTheDocument();
    rerender(<FieldRow {...base} field={field('basic', 'phone')} status="recognized" value="138 0013 8000" />);
    expect(screen.queryByText('格式不正确')).not.toBeInTheDocument();
    rerender(<FieldRow {...base} field={field('basic', 'email')} status="recognized" value="a@b" />);
    fireEvent.blur(screen.getByLabelText('邮箱'));
    expect(screen.getByText('格式不正确')).toBeInTheDocument();
  });

  it('flags an empty core field at once, without waiting for a blur', () => {
    render(<FieldRow {...base} field={field('basic', 'email')} status="missing" value={null} />);
    expect(screen.getByText('必填')).toBeInTheDocument();
  });

  it('does not nag about an empty optional field', () => {
    render(<FieldRow {...base} field={field('basic', 'homepage')} status="missing" value={null} />);
    fireEvent.blur(screen.getByLabelText('个人主页'));
    expect(screen.queryByText('必填')).not.toBeInTheDocument();
  });

  it('shows "内容过长" for text over the contract limit once touched', () => {
    render(<FieldRow {...base} field={field('basic', 'name')} status="recognized" value={'a'.repeat(101)} />);
    fireEvent.blur(screen.getByLabelText('姓名'));
    expect(screen.getByText('内容过长')).toBeInTheDocument();
  });

  it('does not truncate input silently (no maxLength attribute)', () => {
    render(<FieldRow {...base} field={field('basic', 'name')} status="recognized" value="x" />);
    expect(screen.getByLabelText('姓名')).not.toHaveAttribute('maxlength');
  });

  it('shows a backend / confirm-time error with its reason text, preferring it over the local one', () => {
    render(<FieldRow {...base} field={field('intent', 'job_title')} status="recognized" value="x" error="too_long" />);
    expect(screen.getByText('内容过长')).toBeInTheDocument();
  });
});
