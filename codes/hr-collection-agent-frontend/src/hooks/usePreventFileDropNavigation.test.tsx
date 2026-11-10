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

describe('only file drags are cancelled (review SUGGEST-3)', () => {
  it('leaves a text drag alone so selected text can still be dragged around', () => {
    render(<Probe />);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
    expect(fireEvent.drop(document, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
  });

  it('cancels a drag-over that carries Files even though the files are not readable yet', () => {
    render(<Probe />);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ['Files'], files: [] } })).toBe(false);
  });

  it('cancels a drop that carries files', () => {
    render(<Probe />);
    expect(fireEvent.drop(document, { dataTransfer: { types: ['Files'], files: [file()] } })).toBe(false);
  });
});
