import { Button } from 'antd';
import type { ReactNode } from 'react';
import type { ApiError } from '../api/ApiError';
import type { LocalError, PendingMessage } from '../hooks/model/SessionReducer';
import type { ChatMessage } from '../types/Conversation';
import ErrorAlert from './ErrorAlert';
import MessageBubble from './MessageBubble';
import ThinkingNotice from './ThinkingNotice';

interface MessageListProps {
  messages: readonly ChatMessage[];
  /** The message being sent, or waiting for retry / discard. */
  pending?: PendingMessage | null;
  /** The error of the pending message (chat scope). */
  pendingError?: ApiError | LocalError | null;
  /** The assistant is answering. */
  thinking?: boolean;
  /** Retry / discard are offered only when no request is running. */
  actionsDisabled?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
  /** The suggestion card (or nothing) shown under an assistant message. */
  renderCard?: (message: ChatMessage) => ReactNode;
}

const STAGE_TEXT = { sending: '发送中…', failed: '发送失败', unknown: '无法确认是否已发送' } as const;

/** The conversation so far, plus the message in flight. Content is plain text. */
export default function MessageList({ messages, pending = null, pendingError = null, thinking = false, actionsDisabled = false, onRetry, onDiscard, renderCard }: MessageListProps) {
  if (messages.length === 0 && !pending) return null;
  const lastId = messages.at(-1)?.message_id;
  return (
    <div className="message-list" aria-live="polite" aria-label="对话记录">
      {messages.map((message) => (
        <div key={message.message_id} className="message-row">
          <MessageBubble
            role={message.role}
            content={message.content}
            createdAt={message.created_at}
            focusKey={message.message_id === lastId && !pending ? 'message:last' : undefined}
          />
          {message.role === 'assistant' ? renderCard?.(message) : null}
        </div>
      ))}
      {pending ? (
        <MessageBubble
          role="user"
          content={pending.text}
          focusKey="message:last"
          footer={
            <span className="message-state">
              {STAGE_TEXT[pending.stage]}
              {pending.stage !== 'sending' ? (
                <>
                  {pendingError && pending.stage === 'failed' ? <ErrorAlert error={pendingError} /> : null}
                  <Button size="small" disabled={actionsDisabled} onClick={onRetry}>
                    重试
                  </Button>
                  <Button size="small" disabled={actionsDisabled} onClick={onDiscard}>
                    放弃
                  </Button>
                </>
              ) : null}
            </span>
          }
        />
      ) : null}
      {thinking ? <ThinkingNotice /> : null}
    </div>
  );
}
