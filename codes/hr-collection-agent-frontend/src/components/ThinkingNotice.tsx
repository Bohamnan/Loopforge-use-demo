import { Spin } from 'antd';

/** Shown while the assistant is answering (one synchronous model call). Announced politely. */
export default function ThinkingNotice() {
  return (
    <div className="message message-assistant" role="status" aria-live="polite">
      <Spin size="small" /> <span>思考中…</span>
    </div>
  );
}
