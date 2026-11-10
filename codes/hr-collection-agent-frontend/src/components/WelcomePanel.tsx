import { Button } from 'antd';
import type { ReactNode } from 'react';

interface WelcomePanelProps {
  /** Opens the file picker; the button is hidden when not provided. */
  onUploadClick?: () => void;
  /** Notices shown above the invitation (draft expired, maybe saved...). */
  children?: ReactNode;
}

export default function WelcomePanel({ onUploadClick, children }: WelcomePanelProps) {
  return (
    <div className="welcome-panel">
      {children}
      <h2>你好，我是简历录入助手</h2>
      <p>上传简历文件，我来识别内容，再和你逐项核对，确认后一并归档。</p>
      {onUploadClick ? (
        <Button type="primary" shape="round" onClick={onUploadClick}>
          📎 上传简历
        </Button>
      ) : null}
    </div>
  );
}
