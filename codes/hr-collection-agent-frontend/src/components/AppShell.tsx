import { Button, Drawer } from 'antd';
import { useState, type ReactNode } from 'react';
import { useNarrowScreen } from '../hooks/useNarrowScreen';
import './Layout.css';
import NewChatButton from './NewChatButton';

interface AppShellProps {
  children: ReactNode;
  onNewChat?: () => void;
  newChatDisabled?: boolean;
  /** Fixed area under the conversation (the composer). */
  footer?: ReactNode;
  /** View switch shown next to the title (chat / archive, 2.14). */
  nav?: ReactNode;
  /** Content under the new-chat button (the session list). A function receives `close` for the narrow-screen drawer. */
  sidebar?: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * Page frame: title bar, a narrow side bar with only "new chat", and the main area.
 * Below 860px the side bar folds away and "new chat" moves into the title bar (TD-13).
 * There is no login or account, so no user info; the sidebar only holds the session list (v2).
 */
export default function AppShell({ children, onNewChat, newChatDisabled, footer, nav, sidebar }: AppShellProps) {
  const narrow = useNarrowScreen();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const sidebarNode = typeof sidebar === 'function' ? sidebar(closeDrawer) : sidebar;
  const newChat = <NewChatButton onClick={onNewChat} disabled={newChatDisabled} />;
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo" aria-hidden="true" />
        <h1>HR 简历信息收集</h1>
        {nav ? <nav className="app-nav" aria-label="页面切换">{nav}</nav> : null}
        {narrow ? (
          <span className="app-header-action">
            {sidebarNode ? <Button onClick={() => setDrawerOpen(true)}>会话</Button> : null}
            {newChat}
          </span>
        ) : null}
      </header>
      {narrow && sidebarNode ? (
        <Drawer open={drawerOpen} onClose={closeDrawer} title="会话" placement="left" width={300}>
          {sidebarNode}
        </Drawer>
      ) : null}
      <div className="app-body">
        {narrow ? null : (
          <aside className="app-sidebar" aria-label="会话操作">
            {newChat}
            {sidebarNode}
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
