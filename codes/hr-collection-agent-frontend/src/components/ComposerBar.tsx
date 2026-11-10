import { Button } from 'antd';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
}

/**
 * Bottom bar: an upload button, page-wide drag-and-drop and the AI disclaimer.
 * There is no text input and no free-text parsing (ADR-006, P-01).
 */
const ComposerBar = forwardRef<ComposerBarHandle, ComposerBarProps>(function ComposerBar(
  { onFiles, disabled = false, notice },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ openPicker: () => inputRef.current?.click() }), []);

  useEffect(() => {
    if (disabled) return;
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        onFiles(Array.from(files));
      }
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
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
        {notice ? <div className="composer-notice">{notice}</div> : null}
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
