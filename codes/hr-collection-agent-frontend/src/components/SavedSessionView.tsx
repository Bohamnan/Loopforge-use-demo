import { Button } from 'antd';
import type { ReactNode } from 'react';
import { SECTIONS } from '../hooks/model/SectionConfig';
import { valuesAsFields } from '../hooks/model/SectionView';
import type { SavedSummary, SavedView } from '../hooks/model/SessionReducer';
import FileCard from './FileCard';
import ReadOnlySection from './ReadOnlySection';
import SavedResultCard, { type SavedResultKind } from './SavedResultCard';

interface SavedSessionViewProps {
  kind: SavedResultKind;
  /** The record and update state from the re-read session; null when that read failed. */
  saved: SavedView | null;
  /** The just-saved summary; when absent (an opened saved session) it is taken from the record. */
  summary: SavedSummary | null;
  /** Read-only conversation of the session (cards without buttons). */
  messages?: ReactNode;
  /** Update diff card (task 2.13). */
  diff?: ReactNode;
  busy: boolean;
  onUploadNext: () => void;
  onReread: () => void;
}

const EMPTY_TEXT = '未填写';

/**
 * A saved (or saved-before) session: file, result card, the record read-only (no statuses, TD-22), an applied note,
 * the read-only conversation and the diff card. Opening an applied session shows no "已更新" (TD-24).
 */
export default function SavedSessionView({ kind, saved, summary, messages, diff, busy, onUploadNext, onReread }: SavedSessionViewProps) {
  const resume = saved?.resume ?? null;
  const shownSummary =
    kind === 'saved' && !summary && resume
      ? { name: resume.fields.name ?? '', filename: resume.original_file.filename, saved_at: resume.saved_at }
      : summary;
  if (!saved || !resume) {
    return (
      <div className="saved-session">
        <SavedResultCard kind={kind} summary={shownSummary} onUploadNext={onUploadNext} />
        <Button onClick={onReread} disabled={busy}>
          重新读取
        </Button>
      </div>
    );
  }
  const fields = valuesAsFields(resume.fields);
  return (
    <div className="saved-session">
      <FileCard name={resume.original_file.filename} sizeBytes={resume.original_file.size_bytes} />
      <SavedResultCard kind={kind} summary={shownSummary} onUploadNext={onUploadNext} />
      {SECTIONS.map((section) => (
        <section key={section.key} className="section-card" aria-label={section.title}>
          <h3>{section.title}</h3>
          <ReadOnlySection section={section} fields={fields} buffer={{}} showStatus={false} emptyText={EMPTY_TEXT} />
        </section>
      ))}
      {saved.update_state === 'applied' ? <p className="value-empty">已按本次内容更新</p> : null}
      {messages}
      {diff}
    </div>
  );
}
