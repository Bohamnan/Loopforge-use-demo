import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('test toolchain', () => {
  it('renders with React Testing Library and jest-dom matchers', () => {
    render(<p>smoke</p>);
    expect(screen.getByText('smoke')).toBeInTheDocument();
  });
});
