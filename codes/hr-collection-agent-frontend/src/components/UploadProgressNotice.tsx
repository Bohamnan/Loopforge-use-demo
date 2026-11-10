import { Spin } from 'antd';

/** Single loading hint during synchronous parsing; no step breakdown and no elapsed time (P-05, TD-10). */
export default function UploadProgressNotice() {
  return (
    <div className="upload-notice" role="status" aria-live="polite">
      <Spin />
      <span>正在识别，最长约 1 分钟</span>
    </div>
  );
}
