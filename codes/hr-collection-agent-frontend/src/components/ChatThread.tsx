import type { ReactNode } from 'react';

interface ChatThreadProps {
  children: ReactNode;
}

/** Scrollable conversation area. Accessibility hooks (aria-live, focus) are added in task 2.8. */
export default function ChatThread({ children }: ChatThreadProps) {
  return (
    <div className="chat-stream">
      <div className="chat-thread">{children}</div>
    </div>
  );
}
