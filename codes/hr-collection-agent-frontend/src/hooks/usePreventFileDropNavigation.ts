import { useEffect } from 'react';
import { isFileDrag } from './model/UploadPrecheck';

/**
 * Stops the browser from opening a file that is dropped outside the drop target.
 * Without this, a stray drop navigates the tab away and the unsubmitted edits in memory are lost (F-02: nothing is persisted).
 * Only drags that carry files are cancelled; dragging selected text around keeps working.
 * It only cancels the browser default; handling the dropped file is up to the composer.
 */
export function usePreventFileDropNavigation(): void {
  useEffect(() => {
    const cancel = (event: DragEvent) => {
      if (isFileDrag(event.dataTransfer)) event.preventDefault();
    };
    document.addEventListener('dragover', cancel);
    document.addEventListener('drop', cancel);
    return () => {
      document.removeEventListener('dragover', cancel);
      document.removeEventListener('drop', cancel);
    };
  }, []);
}
