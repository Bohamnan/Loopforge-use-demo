import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FieldStatus } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

describe('FieldStatusTag', () => {
  it.each([
    ['recognized', '待确认'],
    ['uncertain', '不确定、请确认'],
    ['missing', '待补充'],
    ['confirmed', '已确认'],
  ] as [FieldStatus, string][])('shows %s as "%s" (text, not colour alone)', (status, text) => {
    render(<FieldStatusTag status={status} />);
    expect(screen.getByText(text)).toHaveAttribute('data-status', status);
  });

  it('never shows a recognized field as confirmed', () => {
    render(<FieldStatusTag status="recognized" />);
    expect(screen.queryByText('已确认')).not.toBeInTheDocument();
  });
});
