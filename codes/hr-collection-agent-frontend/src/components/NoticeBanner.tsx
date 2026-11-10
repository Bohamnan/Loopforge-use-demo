import { Alert } from 'antd';
import type { NoticeKind } from '../hooks/model/SessionReducer';

/** `already_saved` is not a banner: the result card shows that sentence on its own. */
export type BannerKind = Exclude<NoticeKind, 'already_saved'>;

const NOTICES: Record<BannerKind, { text: string; type: 'info' | 'warning'; role: 'status' | 'alert' }> = {
  // Informational notices are announced politely; warnings that need action keep the alert role.
  restored: { text: '已为你恢复未完成的简历', type: 'info', role: 'status' },
  draft_expired: { text: '草稿已失效，请重新上传简历', type: 'warning', role: 'alert' },
  maybe_saved: { text: '可能已保存，请重新上传核实', type: 'warning', role: 'alert' },
};

interface NoticeBannerProps {
  kind: BannerKind;
  /** Only the restored notice can be closed; the others stay until the next upload. */
  onClose?: () => void;
}

export default function NoticeBanner({ kind, onClose }: NoticeBannerProps) {
  const notice = NOTICES[kind];
  if (!notice) return null;
  const { text, type, role } = notice;
  return (
    <Alert
      type={type}
      role={role}
      showIcon
      message={text}
      closable={kind === 'restored' && onClose !== undefined}
      onClose={onClose}
    />
  );
}
