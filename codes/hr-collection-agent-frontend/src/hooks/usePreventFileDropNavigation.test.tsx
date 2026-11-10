import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePreventFileDropNavigation } from './usePreventFileDropNavigation';

function Probe() {
  usePreventFileDropNavigation();
  return null;
}

const file = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });

describe('usePreventFileDropNavigation', () => {
  it('cancels file drops and drag-overs so the browser never navigates away to open the file', () => {
    render(<Probe />);
    expect(fireEvent.dragOver(document, { dataTransfer: { files: [file()] } })).toBe(false);
    expect(fireEvent.drop(document, { dataTransfer: { files: [file()] } })).toBe(false);
  });

  it('stops cancelling after unmount', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(fireEvent.drop(document, { dataTransfer: { files: [file()] } })).toBe(true);
  });
});
