import { Alert } from 'antd';
import type { NoticeKind } from '../hooks/model/SessionReducer';

const NOTICES: Record<NoticeKind, { text: string; type: 'info' | 'warning' }> = {
  restored: { text: '已为你恢复未完成的简历', type: 'info' },
  draft_expired: { text: '草稿已失效，请重新上传简历', type: 'warning' },
  maybe_saved: { text: '可能已保存，请重新上传核实', type: 'warning' },
  already_saved: { text: '该简历已保存过', type: 'info' },
};

interface NoticeBannerProps {
  kind: NoticeKind;
  /** Only the restored notice can be closed; the others stay until the next upload. */
  onClose?: () => void;
}

export default function NoticeBanner({ kind, onClose }: NoticeBannerProps) {
  const { text, type } = NOTICES[kind];
  return (
    <Alert
      type={type}
      showIcon
      message={text}
      closable={kind === 'restored' && onClose !== undefined}
      onClose={onClose}
    />
  );
}
