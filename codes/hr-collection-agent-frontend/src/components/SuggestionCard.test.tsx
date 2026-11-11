import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleSuggestion } from '../test/ApiMocks';
import SuggestionCard from './SuggestionCard';

const apply = { name: /^应\s?用$/ };

describe('SuggestionCard', () => {
  it.each([
    ['pending', [sampleSuggestion()], true],
    ['applied', [sampleSuggestion({ status: 'applied', old_value: null })], false],
    ['cancelled', [sampleSuggestion({ status: 'cancelled', old_value: null })], false],
    ['none (nothing applicable)', [sampleSuggestion({ applicable: false, reason: 'invalid_format' })], false],
  ] as const)('%s card: apply / cancel buttons shown = %s', (_name, suggestions, shown) => {
    render(<SuggestionCard suggestions={suggestions} actionable />);
    expect(screen.queryByRole('button', apply) !== null).toBe(shown);
  });

  it('shows label, old and new value for a pending row, and only the reason for an inapplicable row', () => {
    render(
      <SuggestionCard
        suggestions={[sampleSuggestion(), sampleSuggestion({ suggestion_id: 's2', field: 'email', old_value: null, new_value: 'bad', applicable: false, reason: 'invalid_format' })]}
        actionable
      />,
    );
    expect(screen.getByText('意向岗位')).toBeInTheDocument();
    expect(screen.getByText('供应链经理')).toBeInTheDocument();
    expect(screen.getByText('采购总监')).toBeInTheDocument();
    expect(screen.getByText('无法应用：格式不正确')).toBeInTheDocument();
  });

  it('has no buttons when not actionable (saved session or busy)', () => {
    render(<SuggestionCard suggestions={[sampleSuggestion()]} actionable={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
