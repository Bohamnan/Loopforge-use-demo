import type { ReactNode } from 'react';
import { formatDateTime } from '../hooks/model/FormatTime';
import type { ChatRole } from '../types/Conversation';

interface MessageBubbleProps {
  role: ChatRole;
  /** Plain text: rendered as a text node, never parsed as Markdown or HTML. */
  content: string;
  createdAt?: string;
  /** Extra line under the text (send state, actions). */
  footer?: ReactNode;
  focusKey?: string;
}

/** One chat bubble. Assistant on the left, user on the right. */
export default function MessageBubble({ role, content, createdAt, footer, focusKey }: MessageBubbleProps) {
  const time = createdAt ? formatDateTime(createdAt) : null;
  return (
    <div className={`message message-${role}`} data-focus-key={focusKey} tabIndex={focusKey ? -1 : undefined}>
      <span className="message-text">{content}</span>
      {time ? <span className="message-time">{time}</span> : null}
      {footer}
    </div>
  );
}
