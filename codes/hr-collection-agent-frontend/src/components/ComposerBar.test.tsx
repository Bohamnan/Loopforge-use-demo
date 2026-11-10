import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ComposerBar, { type ComposerBarHandle } from './ComposerBar';

const pdf = () => new File(['x'], '合成简历.pdf', { type: 'application/pdf' });

describe('ComposerBar', () => {
  it('has an upload button, a single-file input limited to the allowed types, and no text box (ADR-006)', () => {
    const { container } = render(<ComposerBar onFiles={() => undefined} />);
    expect(screen.getByRole('button', { name: /上传简历/ })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.multiple).toBe(false);
    expect(input.accept).toBe('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });

  it('shows the 10 MB hint (P-03) and the AI disclaimer', () => {
    render(<ComposerBar onFiles={() => undefined} />);
    expect(screen.getByText(/10 MB/)).toBeInTheDocument();
    expect(screen.queryByText(/20 MB/)).not.toBeInTheDocument();
    expect(screen.getByText('内容由 AI 识别，可能有误，请逐项核对后再提交。')).toBeInTheDocument();
  });

  it('reports the chosen file and resets the input so the same file can be picked again', async () => {
    const onFiles = vi.fn();
    const { container } = render(<ComposerBar onFiles={onFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = pdf();
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe('');
  });

  it('opens the file picker through the imperative handle', () => {
    const ref = createRef<ComposerBarHandle>();
    const { container } = render(<ComposerBar ref={ref} onFiles={() => undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    ref.current?.openPicker();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('accepts files dropped anywhere on the page', () => {
    const onFiles = vi.fn();
    render(<ComposerBar onFiles={onFiles} />);
    const file = pdf();
    fireEvent.drop(document, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('ignores drops and disables the controls while disabled', () => {
    const onFiles = vi.fn();
    const { container } = render(<ComposerBar onFiles={onFiles} disabled />);
    fireEvent.drop(document, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /上传简历/ })).toBeDisabled();
    expect((container.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows a notice when given one (e.g. several files dropped)', () => {
    render(<ComposerBar onFiles={() => undefined} notice="一次只能上传一个文件，已选择第一个。" />);
    expect(screen.getByText('一次只能上传一个文件，已选择第一个。')).toBeInTheDocument();
  });

  it('removes its page-level drop listener on unmount', () => {
    const onFiles = vi.fn();
    const { unmount } = render(<ComposerBar onFiles={onFiles} />);
    unmount();
    fireEvent.drop(document, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
