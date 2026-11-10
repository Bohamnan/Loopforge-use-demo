import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getSection } from '../hooks/model/SectionConfig';
import { sampleFields } from '../test/ApiMocks';
import SectionCard from './SectionCard';

describe('SectionCard', () => {
  it('shows the title, the section status and the fields', () => {
    render(<SectionCard section={getSection('intent')} fields={sampleFields()} buffer={{}} active={false} onSelect={() => undefined} />);
    expect(screen.getByRole('heading', { name: /求职意向/ })).toBeInTheDocument();
    expect(screen.getAllByText('待补充').length).toBeGreaterThan(0);
    expect(screen.getByText('供应链经理')).toBeInTheDocument();
  });

  it('uses the highest-priority status for the section badge', () => {
    render(<SectionCard section={getSection('skills')} fields={sampleFields()} buffer={{}} active={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('section-status')).toHaveTextContent('待确认');
  });

  it('offers a "修改" entry on inactive sections and selects the section', async () => {
    const onSelect = vi.fn();
    render(<SectionCard section={getSection('intent')} fields={sampleFields()} buffer={{}} active={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /修\s?改/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks the active section and offers no select entry', () => {
    const { container } = render(
      <SectionCard section={getSection('intent')} fields={sampleFields()} buffer={{}} active onSelect={() => undefined} />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('button', { name: /修\s?改/ })).not.toBeInTheDocument();
  });
});
