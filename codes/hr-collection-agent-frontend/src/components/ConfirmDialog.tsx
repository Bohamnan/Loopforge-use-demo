import { Modal } from 'antd';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  content: ReactNode;
  okText: string;
  cancelText?: string;
  onOk: () => void;
  onCancel: () => void;
}

/** Generic second confirmation (overwrite, new chat, unconfirmed fields, unsubmitted edits). */
export default function ConfirmDialog({ open, title, content, okText, cancelText = '取消', onOk, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} okText={okText} cancelText={cancelText} onOk={onOk} onCancel={onCancel} destroyOnHidden>
      {content}
    </Modal>
  );
}
