import { Button, Input } from 'antd';
import { isFileDrag } from '../hooks/model/UploadPrecheck';
import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent, type ReactNode } from 'react';

/** Longest chat message the backend accepts (OpenAPI SendMessageRequest.content). */
export const MESSAGE_MAX_LENGTH = 2000;

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export interface ComposerBarHandle {
  openPicker: () => void;
}

interface ComposerBarProps {
  /** Receives the raw selection; validation and single-file picking happen in the page / model. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Short notice under the bar, e.g. "several files selected". */
  notice?: string;
  /** Quick-reply chips shown above the upload bar. */
  quickReplies?: ReactNode;
  /** Upload failure shown inside the fixed bar, so it stays in view however long the review list is. */
  error?: ReactNode;
  /** Chat text (controlled by the page; kept in memory only, never in browser storage - F-02). */
  text?: string;
  onTextChange?: (text: string) => void;
  onSend?: () => void;
  /** The text box is disabled and shows this hint instead of the placeholder (e.g. before an upload / once saved). */
  textHint?: string;
  /** A message is waiting for retry / discard: the text stays visible but cannot be edited or sent. */
  textReadOnly?: boolean;
}

/**
 * Bottom bar: chat text box, an upload button, page-wide drag-and-drop and the AI disclaimer.
 * The text is only sent to the backend; the frontend never parses it (ADR-007).
 */
const ComposerBar = forwardRef<ComposerBarHandle, ComposerBarProps>(function ComposerBar(
  { onFiles, disabled = false, notice, quickReplies, error, text = '', onTextChange, onSend, textHint, textReadOnly = false },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const tooLong = text.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabled && !textHint && !textReadOnly && text.trim() !== '' && !tooLong;
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line; never while an input method is composing.
    if (event.key !== 'Enter' || event.shiftKey || composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSend?.();
  };

  useImperativeHandle(ref, () => ({ openPicker: () => inputRef.current?.click() }), []);

  // The page-wide listeners stay attached even while disabled: a file drop must always be cancelled, otherwise the
  // browser opens the file and leaves the page, losing unsubmitted edits. Files are only used when enabled.
  // Drags that do not carry files (selected text, links) are not touched.
  useEffect(() => {
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!disabled && files && files.length > 0) {
        onFiles(Array.from(files));
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (isFileDrag(event.dataTransfer)) event.preventDefault();
    };
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragover', onDragOver);
    return () => {
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', onDragOver);
    };
  }, [onFiles, disabled]);

  return (
    <div className="composer-wrap">
      <div className="composer">
        {error ? <div className="composer-error">{error}</div> : null}
        {quickReplies}
        {notice ? <div className="composer-notice" role="status">{notice}</div> : null}
        <div className="composer-text">
          <Input.TextArea
            aria-label="对话输入"
            autoComplete="off"
            autoSize={{ minRows: 1, maxRows: 5 }}
            value={text}
            placeholder={textHint ?? '输入消息，Enter 发送，Shift+Enter 换行'}
            disabled={disabled || textHint !== undefined}
            readOnly={textReadOnly}
            onChange={(event) => onTextChange?.(event.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
          />
          <span className={`composer-count${tooLong ? ' composer-count-over' : ''}`}>
            {text.length}/{MESSAGE_MAX_LENGTH}
          </span>
          <Button type="primary" disabled={!canSend} onClick={onSend}>
            发送
          </Button>
        </div>
        <div className="composer-bar">
          <Button shape="round" disabled={disabled} onClick={() => inputRef.current?.click()}>
            📎 上传简历
          </Button>
          <span className="composer-hint">PDF、JPG、JPEG、PNG · 单个文件 ≤ 10 MB</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          disabled={disabled}
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              onFiles(Array.from(files));
            }
            event.target.value = '';
          }}
        />
      </div>
      <div className="composer-foot">内容由 AI 识别，可能有误，请逐项核对后再提交。</div>
    </div>
  );
});

export default ComposerBar;
