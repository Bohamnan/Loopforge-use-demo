import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FileCard, { formatFileSize } from './FileCard';

describe('FileCard', () => {
  it('shows the file name, an upper-case type badge and the size', () => {
    render(<FileCard name="合成简历.pdf" sizeBytes={1_048_576} />);
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('1.00 MB')).toBeInTheDocument();
  });

  it('omits the size when unknown', () => {
    render(<FileCard name="a.png" />);
    expect(screen.getByText('PNG')).toBeInTheDocument();
    expect(screen.queryByText(/MB|KB|B$/)).not.toBeInTheDocument();
  });

  it('formats sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(10_485_760)).toBe('10.00 MB');
  });
});
