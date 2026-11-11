import { Spin } from 'antd';
import { useRef } from 'react';
import AppShell from '../components/AppShell';
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
import { canConfirmSection, coreReady, unconfirmedCount } from '../hooks/model/SectionView';
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
    dismissNotice,
    selectSection,
    editField,
    confirmSection,
    goFinal,
    discardEditsAndGoFinal,
    backToSections,
    confirmResume,
    proceedUnconfirmed,
    requestNewChat,
    confirmLeave,
    dismissDialog,
    requestUpload,
    selectionNotice,
  } = useResumeSession();
  usePreventFileDropNavigation(); // also covers phases without a composer
  const focusKey = useChatScroll({ phase: state.phase, view: state.view, activeSection: state.activeSection });
  const composerRef = useRef<ComposerBarHandle>(null);
  const busy = state.busy !== null;
  const bannerKind = state.notice === 'session_gone' ? state.notice : null;
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
    case 'empty':
      content = uploading ? (
        pending
      ) : state.busy === 'read' ? (
        <div className="welcome-panel" role="status">
          <Spin /> <span>正在打开会话…</span>
        </div>
      ) : (
        <WelcomePanel onUploadClick={() => composerRef.current?.openPicker()}>
          {bannerKind ? <NoticeBanner kind={bannerKind} onClose={dismissNotice} /> : null}
        </WelcomePanel>
      );
      break;
    case 'reviewing':
      content = (
        <>
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
        <SavedResultCard summary={state.savedSummary} alreadySaved={state.notice === 'already_saved'} onUploadNext={requestNewChat} />
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
    const blocked = !canConfirmSection(section, state.draft.fields, state.editBuffer, busy);
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
      newChatDisabled={busy}
      footer={
        showComposer ? (
          <ComposerBar
            ref={composerRef}
            onFiles={requestUpload}
            disabled={busy}
            notice={selectionNotice}
            quickReplies={quickReplies}
            error={
              uploadError ? (
                <ErrorAlert error={uploadError} timeoutMessage={UPLOAD_TIMEOUT_TEXT} badResponseMessage={UPLOAD_BAD_RESPONSE_TEXT} />
              ) : null
            }
          />
        ) : null
      }
    >
      <ChatThread focusKey={focusKey}>
        {content}
      </ChatThread>
      <ConfirmDialog
        open={state.dialog === 'leave'}
        title="存在未提交的修改"
        content="有未提交的修改，继续将放弃这些修改。是否继续？"
        okText="放弃修改并继续"
        cancelText="返回"
        onOk={confirmLeave}
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
