import { Spin } from 'antd';
import AppShell from '../components/AppShell';
import BootstrapErrorPanel from '../components/BootstrapErrorPanel';
import ChatThread from '../components/ChatThread';
import NoticeBanner from '../components/NoticeBanner';
import WelcomePanel from '../components/WelcomePanel';
import { useResumeSession } from '../hooks/useResumeSession';
import type { ApiError } from '../api/ApiError';

/** Page orchestration only: picks what to render from the session state; never calls the API itself. */
export default function ResumeCollectionPage() {
  const { state, retryBootstrap, dismissNotice } = useResumeSession();
  const busy = state.busy !== null;

  let content;
  switch (state.phase) {
    case 'bootstrapping':
      content = (
        <div className="welcome-panel" role="status">
          <Spin /> <span>正在读取草稿…</span>
        </div>
      );
      break;
    case 'bootstrap_failed':
      content = state.error ? (
        <BootstrapErrorPanel error={state.error.cause as ApiError} onRetry={retryBootstrap} />
      ) : null;
      break;
    case 'empty':
      content = <WelcomePanel>{state.notice ? <NoticeBanner kind={state.notice} /> : null}</WelcomePanel>;
      break;
    case 'reviewing':
      content = state.notice ? <NoticeBanner kind={state.notice} onClose={dismissNotice} /> : null;
      break;
    default:
      content = null;
  }

  return (
    <AppShell newChatDisabled={busy || state.phase === 'bootstrapping' || state.phase === 'bootstrap_failed'}>
      <ChatThread>{content}</ChatThread>
    </AppShell>
  );
}
