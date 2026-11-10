import { Spin } from 'antd';
import { useRef } from 'react';
import type { ApiError } from '../api/ApiError';
import AppShell from '../components/AppShell';
import BootstrapErrorPanel from '../components/BootstrapErrorPanel';
import ChatThread from '../components/ChatThread';
import ComposerBar, { type ComposerBarHandle } from '../components/ComposerBar';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorAlert from '../components/ErrorAlert';
import FileCard from '../components/FileCard';
import NoticeBanner from '../components/NoticeBanner';
import UploadProgressNotice from '../components/UploadProgressNotice';
import WelcomePanel from '../components/WelcomePanel';
import { useResumeSession } from '../hooks/useResumeSession';

const UPLOAD_TIMEOUT_TEXT = '识别时间过长，请重新上传。';

/** Page orchestration only: picks what to render from the session state; never calls the API itself. */
export default function ResumeCollectionPage() {
  const { state, retryBootstrap, dismissNotice, requestUpload, confirmOverwrite, cancelOverwrite, selectionNotice } =
    useResumeSession();
  const composerRef = useRef<ComposerBarHandle>(null);
  const busy = state.busy !== null;
  const uploading = state.busy === 'upload';
  const uploadError = state.error?.scope === 'upload' ? state.error.cause : null;

  const pending = uploading && state.pendingFile ? (
    <>
      <FileCard name={state.pendingFile.name} sizeBytes={state.pendingFile.size} />
      <UploadProgressNotice />
    </>
  ) : null;

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
      content = uploading ? (
        pending
      ) : (
        <WelcomePanel onUploadClick={() => composerRef.current?.openPicker()}>
          {state.notice ? <NoticeBanner kind={state.notice} /> : null}
        </WelcomePanel>
      );
      break;
    case 'reviewing':
      content = (
        <>
          {state.notice ? <NoticeBanner kind={state.notice} onClose={dismissNotice} /> : null}
          {state.draft ? (
            <FileCard name={state.draft.original_file.filename} sizeBytes={state.draft.original_file.size_bytes} />
          ) : null}
          {pending}
        </>
      );
      break;
    default:
      content = null;
  }

  const showComposer = state.phase === 'empty' || state.phase === 'reviewing';

  return (
    <AppShell
      newChatDisabled={busy || state.phase === 'bootstrapping' || state.phase === 'bootstrap_failed'}
      footer={
        showComposer ? (
          <ComposerBar ref={composerRef} onFiles={requestUpload} disabled={busy} notice={selectionNotice} />
        ) : null
      }
    >
      <ChatThread>
        {content}
        {uploadError ? <ErrorAlert error={uploadError} timeoutMessage={UPLOAD_TIMEOUT_TEXT} /> : null}
      </ChatThread>
      <ConfirmDialog
        open={state.dialog === 'overwrite'}
        title="覆盖当前草稿"
        content="将用新文件覆盖当前未确认的简历内容（含未提交的修改），是否继续？"
        okText="继续上传"
        onOk={confirmOverwrite}
        onCancel={cancelOverwrite}
      />
    </AppShell>
  );
}
