import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ComposerBar, { type ComposerBarHandle } from './ComposerBar';

const pdf = () => new File(['x'], '合成简历.pdf', { type: 'application/pdf' });

describe('ComposerBar', () => {
  it('has an upload button, a single-file input limited to the allowed types, and a chat text box that is not remembered by the browser (ADR-007, F-02)', () => {
    const { container } = render(<ComposerBar onFiles={() => undefined} />);
    expect(screen.getByRole('button', { name: /上传简历/ })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.multiple).toBe(false);
    expect(input.accept).toBe('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
    expect(screen.getByRole('textbox', { name: '对话输入' })).toHaveAttribute('autocomplete', 'off');
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

  it('still cancels the browser default for drops while disabled, so an unsaved page is never left (review SUGGEST)', () => {
    const onFiles = vi.fn();
    render(<ComposerBar onFiles={onFiles} disabled />);
    expect(fireEvent.drop(document, { dataTransfer: { files: [pdf()] } })).toBe(false);
    expect(fireEvent.dragOver(document, { dataTransfer: { files: [pdf()] } })).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
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

  it('resumes accepting files as soon as it is enabled again', () => {
    const onFiles = vi.fn();
    const { rerender } = render(<ComposerBar onFiles={onFiles} disabled />);
    rerender(<ComposerBar onFiles={onFiles} />);
    fireEvent.drop(document, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});

describe('ComposerBar drag types (review SUGGEST-3)', () => {
  it('does not touch text drags, enabled or disabled', () => {
    const { rerender } = render(<ComposerBar onFiles={() => undefined} />);
    expect(fireEvent.drop(document, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
    rerender(<ComposerBar onFiles={() => undefined} disabled />);
    expect(fireEvent.drop(document, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
  });

  it('cancels file drags, and hands over files only when enabled', () => {
    const onFiles = vi.fn();
    render(<ComposerBar onFiles={onFiles} />);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ['Files'], files: [] } })).toBe(false);
    expect(fireEvent.drop(document, { dataTransfer: { types: ['Files'], files: [pdf()] } })).toBe(false);
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});

describe('ComposerBar accessibility', () => {
  it('announces its notice politely', () => {
    render(<ComposerBar onFiles={() => undefined} notice="一次只能上传一个文件，已选择第一个。" />);
    expect(screen.getByRole('status')).toHaveTextContent('一次只能上传一个文件');
  });

  it('the upload button works from the keyboard', async () => {
    const { container } = render(<ComposerBar onFiles={() => undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    screen.getByRole('button', { name: /上传简历/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('ComposerBar chat input (REQ-FE-07.1)', () => {
  const box = () => screen.getByRole('textbox', { name: '对话输入' });
  const setup = (props: Partial<React.ComponentProps<typeof ComposerBar>> = {}) => {
    const onSend = vi.fn();
    render(<ComposerBar onFiles={() => undefined} text="你好" onTextChange={() => undefined} onSend={onSend} {...props} />);
    return onSend;
  };

  it('Enter sends, Shift+Enter does not', () => {
    const onSend = setup();
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not send while an input method is composing', () => {
    const onSend = setup();
    fireEvent.compositionStart(box());
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.compositionEnd(box());
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks blank text and text over 2000 characters (no truncation), allows exactly 2000', () => {
    const { rerender } = render(<ComposerBar onFiles={() => undefined} text="   " onSend={() => undefined} />);
    expect(screen.getByRole('button', { name: /发\s?送/ })).toBeDisabled();
    rerender(<ComposerBar onFiles={() => undefined} text={'好'.repeat(2000)} onSend={() => undefined} />);
    expect(screen.getByRole('button', { name: /发\s?送/ })).toBeEnabled();
    expect(screen.getByText('2000/2000')).toBeInTheDocument();
    rerender(<ComposerBar onFiles={() => undefined} text={'好'.repeat(2001)} onSend={() => undefined} />);
    expect(screen.getByRole('button', { name: /发\s?送/ })).toBeDisabled();
    expect(box()).toHaveValue('好'.repeat(2001));
  });

  it('shows a hint and cannot send when the text box is closed, and keeps the text visible but locked when read-only', () => {
    const { rerender } = render(<ComposerBar onFiles={() => undefined} text="" textHint="请先上传简历" />);
    expect(box()).toBeDisabled();
    expect(box()).toHaveAttribute('placeholder', '请先上传简历');
    rerender(<ComposerBar onFiles={() => undefined} text="待重试" textReadOnly onSend={() => undefined} />);
    expect(box()).toHaveValue('待重试');
    expect(box()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /发\s?送/ })).toBeDisabled();
  });
});
