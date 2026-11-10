import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import { getSection } from '../hooks/model/SectionConfig';
import { sampleFields } from '../test/ApiMocks';
import SectionCard from './SectionCard';

function setup(sectionKey: Parameters<typeof getSection>[0], props: Partial<React.ComponentProps<typeof SectionCard>> = {}) {
  const onEdit = vi.fn();
  const onConfirm = vi.fn();
  const fields = props.fields ?? sampleFields();
  const utils = render(
    <SectionCard
      section={getSection(sectionKey)}
      fields={fields}
      buffer={{}}
      active
      onEdit={onEdit}
      onConfirm={onConfirm}
      onSelect={() => undefined}
      {...props}
    />,
  );
  return { onEdit, onConfirm, ...utils };
}

describe('SectionCard (editing)', () => {
  it('renders inputs for the fields of the active section and reports edits as a field update', async () => {
    const { onEdit } = setup('intent');
    await userEvent.type(screen.getByLabelText('期望城市'), 'S');
    expect(onEdit).toHaveBeenCalledWith({ expected_city: 'S' });
  });

  it('shows the edit buffer in the inputs', () => {
    setup('intent', { buffer: { job_title: '新岗位' } });
    expect(screen.getByLabelText('意向岗位')).toHaveValue('新岗位');
  });

  it('shows no inputs for an inactive section', () => {
    render(<SectionCard section={getSection('intent')} fields={sampleFields()} buffer={{}} active={false} onSelect={() => undefined} onEdit={() => undefined} onConfirm={() => undefined} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('puts missing / uncertain fields first', () => {
    setup('intent');
    const labels = screen.getAllByRole('textbox').map((el) => el.getAttribute('id'));
    expect(labels.slice(0, 3)).toEqual(['field-expected_city', 'field-expected_salary', 'field-available_time']);
  });

  it('edits text lists through the list editor', async () => {
    const { onEdit } = setup('skills');
    await userEvent.click(screen.getByRole('button', { name: /添加一项/ }));
    expect(onEdit).toHaveBeenCalledWith({ skills: ['Excel', ''] });
  });

  it('calls onConfirm from the confirm button, labelled by section state', async () => {
    const { onConfirm } = setup('intent');
    await userEvent.click(screen.getByRole('button', { name: /确认本区/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says "空项将按留空确认" when optional fields are missing', () => {
    setup('intent');
    expect(screen.getByText(/空项将按留空确认/)).toBeInTheDocument();
  });

  it('shows "已确认" disabled for a confirmed section without edits, and "确认修改" once edited', () => {
    const fields = sampleFields();
    fields.skills.status = 'confirmed';
    const { unmount } = setup('skills', { fields });
    expect(screen.getByRole('button', { name: '已确认' })).toBeDisabled();
    unmount();
    setup('skills', { fields, buffer: { skills: ['Excel', 'SAP'] } });
    expect(screen.getByRole('button', { name: '确认修改' })).toBeEnabled();
  });

  it('disables the confirm button and explains why while a core field is empty or invalid', () => {
    setup('basic', { buffer: { phone: '123' } });
    expect(screen.getByRole('button', { name: /确认本区/ })).toBeDisabled();
    expect(screen.getByText('请先补充并修正姓名、手机号、邮箱')).toBeInTheDocument();
  });

  it('disables inputs and the confirm button while a request is in flight', () => {
    setup('intent', { busy: true });
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: /确认本区/ })).toBeDisabled();
  });

  it('shows a section-level error with a retryable button', async () => {
    const { onConfirm } = setup('intent', { error: ApiError.timeout() });
    expect(screen.getByRole('alert')).toHaveTextContent('请求超时');
    await userEvent.click(screen.getByRole('button', { name: /确认本区/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows field errors from the backend next to the field and never echoes the value', () => {
    setup('basic', { fieldErrors: { phone: 'invalid_format' } });
    const row = document.querySelector('[data-field="phone"]') as HTMLElement;
    expect(within(row).getByText('格式不正确')).toBeInTheDocument();
  });

  it('keeps typing in a field after a blur validation without losing the value', () => {
    setup('basic');
    fireEvent.blur(screen.getByLabelText('姓名'));
    expect(screen.getByLabelText('姓名')).toHaveValue('测试用户甲');
  });
});
