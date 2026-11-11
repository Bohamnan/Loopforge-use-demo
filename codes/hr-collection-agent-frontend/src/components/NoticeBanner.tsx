import { Alert } from 'antd';

/** Banners shown above the welcome panel. `already_saved` / `updated` are shown by the result card, not as banners. */
export type BannerKind = 'session_gone';

const NOTICES: Record<BannerKind, { text: string; type: 'info' | 'warning'; role: 'status' | 'alert' }> = {
  session_gone: { text: '该会话已不存在', type: 'warning', role: 'alert' },
};

interface NoticeBannerProps {
  kind: BannerKind;
  onClose?: () => void;
}

export default function NoticeBanner({ kind, onClose }: NoticeBannerProps) {
  const { text, type, role } = NOTICES[kind];
  return <Alert type={type} role={role} showIcon message={text} closable={onClose !== undefined} onClose={onClose} />;
}
