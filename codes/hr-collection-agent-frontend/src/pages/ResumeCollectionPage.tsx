import { Button, Spin } from 'antd';
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
import QuickReplyChips from '../components/QuickReplyChips';
import ReviewSummary from '../components/ReviewSummary';
import SectionCard from '../components/SectionCard';
import UploadProgressNotice from '../components/UploadProgressNotice';
import WelcomePanel from '../components/WelcomePanel';
import { getSection, SECTIONS } from '../hooks/model/SectionConfig';
import { sectionConfirmBlock, sectionStatus } from '../hooks/model/SectionView';
import { useResumeSession } from '../hooks/useResumeSession';

const UPLOAD_TIMEOUT_TEXT = '识别时间过长，请重新上传。';

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
    dismissDialog,
    requestUpload,
    confirmOverwrite,
    cancelOverwrite,
    selectionNotice,
  } = useResumeSession();
  const composerRef = useRef<ComposerBarHandle>(null);
  const busy = state.busy !== null;
  const uploading = state.busy === 'upload';
  const uploadError = state.error?.scope === 'upload' ? state.error.cause : null;
  const sectionError = state.error?.scope === 'section' ? state.error.cause : null;
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
          {state.draft && state.view === 'sections' ? (
            <ReviewSummary fields={state.draft.fields} onJump={selectSection} />
          ) : null}
          {state.draft
            ? SECTIONS.map((section) => {
                const active = state.view === 'sections' && state.activeSection === section.key;
                return (
                  <SectionCard
                    key={section.key}
                    section={section}
                    fields={state.draft!.fields}
                    buffer={state.editBuffer}
                    active={active}
                    onSelect={state.view === 'sections' ? () => selectSection(section.key) : undefined}
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
            // Interim final view; replaced by the final confirmation card in task 2.6.
            <Button onClick={backToSections}>我还要修改</Button>
          ) : null}
          {pending}
        </>
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
