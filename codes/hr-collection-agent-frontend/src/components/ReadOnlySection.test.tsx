import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getSection } from '../hooks/model/SectionConfig';
import { sampleFields } from '../test/ApiMocks';
import ReadOnlySection from './ReadOnlySection';

describe('ReadOnlySection', () => {
  it('shows the full phone number without masking (P-10) and the other core values', () => {
    render(<ReadOnlySection section={getSection('basic')} fields={sampleFields()} buffer={{}} />);
    expect(screen.getByText('13800138000')).toBeInTheDocument();
    expect(screen.getByText('测试用户甲')).toBeInTheDocument();
    expect(screen.getByText('test.user@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*\*/)).not.toBeInTheDocument();
  });

  it('shows null as a "not provided" placeholder and never fills it in', () => {
    render(<ReadOnlySection section={getSection('basic')} fields={sampleFields()} buffer={{}} />);
    const homepage = document.querySelector('[data-field="homepage"]') as HTMLElement;
    expect(within(homepage).getByText('（未提供）')).toBeInTheDocument();
    expect(within(homepage).getByText('待补充')).toBeInTheDocument();
  });

  it('puts missing / uncertain fields first and marks them', () => {
    render(<ReadOnlySection section={getSection('basic')} fields={sampleFields()} buffer={{}} />);
    const keys = Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));
    expect(keys).toEqual(['homepage', 'name', 'phone', 'email']);
    expect(document.querySelector('[data-field="homepage"]')).toHaveClass('field-attention');
    expect(document.querySelector('[data-field="name"]')).not.toHaveClass('field-attention');
  });

  it('shows uncertain fields with the "请确认" status', () => {
    render(<ReadOnlySection section={getSection('intent')} fields={sampleFields()} buffer={{}} />);
    const salary = document.querySelector('[data-field="expected_salary"]') as HTMLElement;
    expect(within(salary).getByText('30-40K')).toBeInTheDocument();
    expect(within(salary).getByText('不确定、请确认')).toBeInTheDocument();
  });

  it('shows text lists as items and empty lists as a placeholder', () => {
    const { rerender } = render(<ReadOnlySection section={getSection('skills')} fields={sampleFields()} buffer={{}} />);
    expect(screen.getByText('Excel')).toBeInTheDocument();
    rerender(<ReadOnlySection section={getSection('certificates')} fields={sampleFields()} buffer={{}} />);
    expect(screen.getByText('（未提供）')).toBeInTheDocument();
  });

  it('shows every item of an experience list with its labelled sub-fields', () => {
    const fields = sampleFields();
    fields.work_experiences.value = [
      { company: '甲公司', position: '主管', start_date: '2018.07', end_date: '至今', responsibilities: ['负责采购'], achievements: [] },
      { company: '乙公司', position: '专员' },
    ];
    render(<ReadOnlySection section={getSection('work')} fields={fields} buffer={{}} />);
    expect(screen.getByText('甲公司')).toBeInTheDocument();
    expect(screen.getByText('乙公司')).toBeInTheDocument();
    expect(screen.getByText('负责采购')).toBeInTheDocument();
    expect(screen.getAllByText('公司名称')).toHaveLength(2);
    expect(screen.getByText('2018.07')).toBeInTheDocument();
  });

  it('shows an unsubmitted edit instead of the saved value, with a marker that is not a field status', () => {
    render(<ReadOnlySection section={getSection('intent')} fields={sampleFields()} buffer={{ job_title: '新岗位' }} />);
    const row = document.querySelector('[data-field="job_title"]') as HTMLElement;
    expect(within(row).getByText('新岗位')).toBeInTheDocument();
    expect(within(row).getByText('未提交修改')).toBeInTheDocument();
    expect(within(row).getByText('待确认')).toBeInTheDocument();
  });

  it('showStatus=false hides status tags and highlight, keeps the fixed order and shows emptyText', () => {
    render(<ReadOnlySection section={getSection('basic')} fields={sampleFields()} buffer={{}} showStatus={false} emptyText="未填写" />);
    const keys = Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));
    expect(keys).toEqual(['name', 'phone', 'email', 'homepage']);
    expect(document.querySelector('.field-attention')).toBeNull();
    expect(screen.queryByText(/待补充|待确认|已确认|不确定/)).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-field="homepage"]') as HTMLElement).getByText('未填写')).toBeInTheDocument();
  });
});
