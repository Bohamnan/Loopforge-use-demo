import type { ReactNode } from 'react';
import './Layout.css';
import NewChatButton from './NewChatButton';

interface AppShellProps {
  children: ReactNode;
  onNewChat?: () => void;
  newChatDisabled?: boolean;
  /** Fixed area under the conversation (the composer). */
  footer?: ReactNode;
}

/**
 * Page frame: title bar, a narrow side bar with only "new chat", and the main area.
 * There is no login or account in this release, so no user info and no history list (P-02).
 */
export default function AppShell({ children, onNewChat, newChatDisabled, footer }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo" aria-hidden="true" />
        <h1>HR 简历信息收集</h1>
      </header>
      <div className="app-body">
        <aside className="app-sidebar">
          <NewChatButton onClick={onNewChat} disabled={newChatDisabled} />
        </aside>
        <main className="app-main">
          {children}
          {footer}
        </main>
      </div>
    </div>
  );
}
