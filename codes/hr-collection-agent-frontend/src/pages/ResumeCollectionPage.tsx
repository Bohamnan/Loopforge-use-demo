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
import FinalReviewCard from '../components/FinalReviewCard';
import NoticeBanner from '../components/NoticeBanner';
import QuickReplyChips from '../components/QuickReplyChips';
import ReviewSummary from '../components/ReviewSummary';
import SavedResultCard from '../components/SavedResultCard';
import SectionCard from '../components/SectionCard';
import UploadProgressNotice from '../components/UploadProgressNotice';
import WelcomePanel from '../components/WelcomePanel';
import { getSection, SECTIONS } from '../hooks/model/SectionConfig';
import { coreReady, sectionConfirmBlock, sectionStatus, unconfirmedCount } from '../hooks/model/SectionView';
import { useChatScroll } from '../hooks/useChatScroll';
import { usePreventFileDropNavigation } from '../hooks/usePreventFileDropNavigation';
import { useResumeSession } from '../hooks/useResumeSession';

const UPLOAD_TIMEOUT_TEXT = '识别时间过长，请重新上传。';
// A 2xx answer of the wrong shape: the server may already have replaced the draft, so the screen cannot be trusted.
const UPLOAD_BAD_RESPONSE_TEXT = '上传结果异常，请刷新页面后核对。';

/** Page orchestration only: picks what to render from the session state; never calls the API itself. */
export default function ResumeCollectionPage() {
  const {
    state,
    retryBootstrap,
    dismissNotice,
    selectSection,
    editField,
    confirmSection,
    goFinal,
    discardEditsAndGoFinal,
    backToSections,
    confirmResume,
    proceedUnconfirmed,
    uploadNext,
    requestNewChat,
    confirmNewChat,
    dismissDialog,
    requestUpload,
    confirmOverwrite,
    cancelOverwrite,
    selectionNotice,
  } = useResumeSession();
  usePreventFileDropNavigation(); // also covers phases without a composer
  const focusKey = useChatScroll({ phase: state.phase, view: state.view, activeSection: state.activeSection });
  const composerRef = useRef<ComposerBarHandle>(null);
  const busy = state.busy !== null;
  const bannerKind = state.notice && state.notice !== 'already_saved' ? state.notice : null;
  const hasUnsubmittedEdits = Object.keys(state.editBuffer).length > 0;
  const uploading = state.busy === 'upload';
  const uploadError = state.error?.scope === 'upload' ? state.error.cause : null;
  const sectionError = state.error?.scope === 'section' ? state.error.cause : null;
  const confirmError = state.error?.scope === 'confirm' ? state.error.cause : null;
  const inSections = state.phase === 'reviewing' && state.view === 'sections' && state.draft !== null;

  const pending =
    uploading && state.pendingFile ? (
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
          {bannerKind ? <NoticeBanner kind={bannerKind} /> : null}
        </WelcomePanel>
      );
      break;
    case 'reviewing':
      content = (
        <>
          {bannerKind ? <NoticeBanner kind={bannerKind} onClose={dismissNotice} /> : null}
          {state.draft ? (
            <FileCard name={state.draft.original_file.filename} sizeBytes={state.draft.original_file.size_bytes} />
          ) : null}
          {state.draft && state.view === 'sections' ? (
            <ReviewSummary fields={state.draft.fields} onJump={selectSection} />
          ) : null}
          {state.draft && state.view === 'sections'
            ? SECTIONS.map((section) => {
                const active = state.activeSection === section.key;
                return (
                  <SectionCard
                    key={section.key}
                    section={section}
                    fields={state.draft!.fields}
                    buffer={state.editBuffer}
                    active={active}
                    onSelect={() => selectSection(section.key)}
                    onEdit={active ? editField : undefined}
                    onConfirm={active ? () => confirmSection(section.key) : undefined}
                    fieldErrors={state.fieldErrors}
                    busy={busy}
                    error={active ? sectionError : null}
                  />
                );
              })
            : null}
          {state.draft && state.view === 'final' ? (
            <FinalReviewCard
              fields={state.draft.fields}
              buffer={state.editBuffer}
              unconfirmedCount={unconfirmedCount(state.draft.fields)}
              coreReady={coreReady(state.draft.fields, state.editBuffer)}
              busy={state.busy === 'confirm'}
              error={confirmError}
              onConfirm={confirmResume}
              onBack={() => backToSections()}
              onEditCore={() => backToSections('basic')}
            />
          ) : null}
          {pending}
        </>
      );
      break;
    case 'saved':
      content = (
        <SavedResultCard summary={state.savedSummary} alreadySaved={state.notice === 'already_saved'} onUploadNext={uploadNext} />
      );
      break;
    default:
      content = null;
  }

  const showComposer = state.phase === 'empty' || state.phase === 'reviewing';

  // Quick replies trigger the same actions as the buttons on the active card.
  let quickReplies = null;
  if (inSections && state.draft) {
    const section = getSection(state.activeSection);
    const dirty = section.fields.some((f) => f.key in state.editBuffer);
    const alreadyConfirmed = sectionStatus(section, state.draft.fields) === 'confirmed' && !dirty;
    const blocked = busy || alreadyConfirmed || sectionConfirmBlock(section, state.draft.fields, state.editBuffer) !== null;
    quickReplies = (
      <QuickReplyChips
        chips={[
          { label: '确认无误', primary: true, disabled: blocked, onClick: () => confirmSection(section.key) },
          { label: '其余都没问题', disabled: busy, onClick: goFinal },
        ]}
      />
    );
  }

  return (
    <AppShell
      onNewChat={requestNewChat}
      newChatDisabled={busy || state.phase === 'bootstrapping' || state.phase === 'bootstrap_failed'}
      footer={
        showComposer ? (
          <ComposerBar
            ref={composerRef}
            onFiles={requestUpload}
            disabled={busy}
            notice={selectionNotice}
            quickReplies={quickReplies}
          />
        ) : null
      }
    >
      <ChatThread focusKey={focusKey}>
        {content}
        {uploadError ? <ErrorAlert error={uploadError} timeoutMessage={UPLOAD_TIMEOUT_TEXT} badResponseMessage={UPLOAD_BAD_RESPONSE_TEXT} /> : null}
      </ChatThread>
      <ConfirmDialog
        open={state.dialog === 'overwrite'}
        title="覆盖当前草稿"
        content="将用新文件覆盖当前未确认的简历内容（含未提交的修改），是否继续？"
        okText="继续上传"
        onOk={confirmOverwrite}
        onCancel={cancelOverwrite}
      />
      <ConfirmDialog
        open={state.dialog === 'new_chat'}
        title="开始新对话"
        content={
          <>
            <p>界面将清空。未确认的简历草稿仍会保留，刷新页面会恢复它；再次上传新简历会覆盖它。</p>
            {hasUnsubmittedEdits ? <p>未提交的修改将丢失。</p> : null}
          </>
        }
        okText="清空并开始"
        onOk={confirmNewChat}
        onCancel={dismissDialog}
      />
      <ConfirmDialog
        open={state.dialog === 'unconfirmed'}
        title="还有字段未确认"
        content={`还有 ${state.draft ? unconfirmedCount(state.draft.fields) : 0} 项字段未确认，继续将视为确认当前显示的全部内容。`}
        okText="继续确认"
        cancelText="返回检查"
        onOk={proceedUnconfirmed}
        onCancel={dismissDialog}
      />
      <ConfirmDialog
        open={state.dialog === 'unsubmitted_edits'}
        title="存在未提交的修改"
        content="有未提交的修改，继续将放弃这些修改。是否继续？"
        okText="放弃修改并继续"
        cancelText="返回"
        onOk={discardEditsAndGoFinal}
        onCancel={dismissDialog}
      />
    </AppShell>
  );
}
