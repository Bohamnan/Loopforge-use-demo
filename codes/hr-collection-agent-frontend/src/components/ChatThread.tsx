import { useEffect, useRef, type ReactNode } from 'react';

interface ChatThreadProps {
  children: ReactNode;
  /** Name of the block (`data-focus-key`) to scroll to and focus; changes trigger it again. */
  focusKey?: string | null;
}

/** Scrollable conversation area. Moves focus to the block named by `focusKey` so keyboard users follow the flow. */
export default function ChatThread({ children, focusKey = null }: ChatThreadProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    const target = container.current?.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`);
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <div className="chat-stream">
      <div className="chat-thread" ref={container}>
        {children}
      </div>
    </div>
  );
}
