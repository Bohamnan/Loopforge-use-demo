import type { ReactNode } from 'react';
import { useNarrowScreen } from '../hooks/useNarrowScreen';
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
 * Below 860px the side bar folds away and "new chat" moves into the title bar (TD-13).
 * There is no login or account in this release, so no user info and no history list (P-02).
 */
export default function AppShell({ children, onNewChat, newChatDisabled, footer }: AppShellProps) {
  const narrow = useNarrowScreen();
  const newChat = <NewChatButton onClick={onNewChat} disabled={newChatDisabled} />;
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo" aria-hidden="true" />
        <h1>HR 简历信息收集</h1>
        {narrow ? <span className="app-header-action">{newChat}</span> : null}
      </header>
      <div className="app-body">
        {narrow ? null : (
          <aside className="app-sidebar" aria-label="会话操作">
            {newChat}
          </aside>
        )}
        <main className="app-main">
          {children}
          {footer}
        </main>
      </div>
    </div>
  );
}
