import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/ApiError';
import {
  sampleChatMessage,
  sampleCreateResumeResponse,
  sampleSendMessageResponse,
  sampleSessionDetail,
  sampleSuggestion,
} from '../../test/ApiMocks';
import type { ErrorCode } from '../../types/Errors';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import type { SessionDetail } from '../../types/Session';
import { initialState, sessionReducer, type SessionAction, type SessionState } from './SessionReducer';

// Table-driven over design §5.3 A-G. Failures never clear the old view; "saved" / "updated" only follow a
// well-formed success or a verifying read (F-03 at reducer level).

const pdf = () => new File(['x'], '合成简历.pdf', { type: 'application/pdf' });
const apiError = (code: ErrorCode, details?: ApiError['details']) =>
  new ApiError({ code, message: '后端提示', status: 400, request_id: 'req_1', details });
const timeoutError = () => ApiError.timeout();

function run(state: SessionState, ...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state);
}

/** Opens a session through the real transitions (OPEN_REQUESTED, READ_SUCCEEDED). */
function open(detail: SessionDetail, from: SessionState = initialState()): SessionState {
  return run(from, { type: 'OPEN_REQUESTED', id: detail.session_id }, { type: 'READ_SUCCEEDED', detail, epoch: from.epoch });
}

function allConfirmedDetail(): SessionDetail {
  const detail = sampleSessionDetail('reviewing');
  for (const key of RESUME_FIELD_KEYS) detail.fields![key].status = 'confirmed';
  return detail;
}

const withCard = (): SessionDetail => ({
  ...sampleSessionDetail('reviewing'),
  messages: [
    sampleChatMessage('user', '哨兵-对话-0001', { message_id: 'u1' }),
    sampleChatMessage('assistant', '哨兵-回复-0001', { message_id: 'a1', suggestions: [sampleSuggestion()] }),
  ],
});

/** reviewing/final with every field confirmed and nothing unsubmitted: ready to confirm. */
const readyToConfirm = () => open(allConfirmedDetail());
const savedPending = () => open(sampleSessionDetail('pending'));

describe('A. read and switch', () => {
  it('starts empty with no busy', () => {
    expect(initialState()).toMatchObject({ phase: 'empty', busy: null, sessionId: null, epoch: 0 });
  });

  it('opening a reviewing session enters reviewing/sections at the first section needing attention', () => {
    const asking = run(initialState(), { type: 'OPEN_REQUESTED', id: 's1' });
    expect(asking).toMatchObject({ busy: 'read', readPurpose: 'open', phase: 'empty' });
    const s = open(sampleSessionDetail('reviewing'));
    expect(s).toMatchObject({ phase: 'reviewing', view: 'sections', busy: null, sessionId: sampleSessionDetail().session_id, epoch: 1 });
    expect(s.activeSection).toBe('basic');
    expect(s.draft?.fields.name.value).toBe('测试用户甲');
    expect(s.saved).toBeNull();
  });

  it('goes straight to the final view when everything is confirmed', () => {
    expect(allConfirmedDetail().fields).not.toBeNull();
    expect(readyToConfirm()).toMatchObject({ phase: 'reviewing', view: 'final' });
  });

  it.each([
    ['saved', null],
    ['pending', 'already_saved'],
    ['applied', null],
  ] as const)('opening a %s session enters the read-only saved view (notice %s)', (kind, notice) => {
    const s = open(sampleSessionDetail(kind));
    expect(s).toMatchObject({ phase: 'saved', draft: null, notice });
    expect(s.saved?.update_state).toBe(sampleSessionDetail(kind).update_state);
  });

  it('keeps the old view when opening fails, and shows the error', () => {
    const before = open(sampleSessionDetail('reviewing'));
    const s = run(before, { type: 'OPEN_REQUESTED', id: 'x' }, { type: 'READ_FAILED', error: apiError('internal_error'), epoch: before.epoch });
    expect(s).toMatchObject({ phase: 'reviewing', busy: null, draft: before.draft });
    expect(s.error?.scope).toBe('read');
  });

  it('session_not_found goes to empty with a notice and drops late responses of the old view', () => {
    const before = open(sampleSessionDetail('reviewing'));
    const s = run(before, { type: 'OPEN_REQUESTED', id: 'x' }, { type: 'READ_FAILED', error: apiError('session_not_found'), epoch: before.epoch });
    expect(s).toMatchObject({ phase: 'empty', notice: 'session_gone', draft: null, epoch: before.epoch + 1 });
    expect(sessionReducer(s, { type: 'READ_SUCCEEDED', detail: sampleSessionDetail('reviewing'), epoch: before.epoch })).toBe(s);
  });

  it('asks before leaving unsubmitted edits; "continue" opens, closing keeps the view and the edits', () => {
    const edited = run(open(sampleSessionDetail('reviewing')), { type: 'FIELD_EDITED', update: { job_title: '改' } });
    const asked = run(edited, { type: 'OPEN_REQUESTED', id: 'other' });
    expect(asked).toMatchObject({ dialog: 'leave', busy: null, dialogTarget: { kind: 'switch', id: 'other' } });
    expect(run(asked, { type: 'LEAVE_CONFIRMED' })).toMatchObject({ busy: 'read', dialog: null });
    expect(run(asked, { type: 'DIALOG_DISMISSED' })).toMatchObject({ dialog: null, editBuffer: { job_title: '改' }, phase: 'reviewing' });
  });

  it.each<SessionAction>([
    { type: 'OPEN_REQUESTED', id: 'x' },
    { type: 'NEW_CHAT_REQUESTED' },
    { type: 'SEND_REQUESTED', text: 'hi' },
    { type: 'FILE_SELECTED', file: pdf() },
    { type: 'DELETE_REQUESTED', id: 'x', status: 'saved' },
  ])('ignores %o while a request is in flight (busy mutual exclusion)', (action) => {
    const busy = run(open(sampleSessionDetail('reviewing')), { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' });
    expect(busy.busy).toBe('patch');
    expect(sessionReducer(busy, action)).toBe(busy);
  });
});

describe('B. upload creates a new session', () => {
  it('valid file starts the upload; invalid file only sets a local error', () => {
    expect(run(initialState(), { type: 'FILE_SELECTED', file: pdf() })).toMatchObject({ busy: 'upload' });
    const bad = run(initialState(), { type: 'FILE_SELECTED', file: new File(['x'], 'a.docx') });
    expect(bad).toMatchObject({ busy: null, error: { scope: 'upload', cause: { kind: 'local' } } });
  });

  it('success replaces the view with the new session (no overwrite dialog), failure keeps the old view', () => {
    const before = open(sampleSessionDetail('saved'));
    const started = run(before, { type: 'FILE_SELECTED', file: pdf() });
    expect(started).toMatchObject({ busy: 'upload', dialog: null });
    const ok = run(started, { type: 'UPLOAD_SUCCEEDED', detail: { ...sampleSessionDetail('reviewing'), session_id: 'new' }, epoch: started.epoch });
    expect(ok).toMatchObject({ phase: 'reviewing', sessionId: 'new', messages: [], pendingFile: null });
    const failed = run(started, { type: 'UPLOAD_FAILED', error: apiError('parse_failed'), epoch: started.epoch });
    expect(failed).toMatchObject({ phase: 'saved', busy: null, pendingFile: null, error: { scope: 'upload' } });
  });

  it('unsubmitted edits go through the leave dialog first (upload intent)', () => {
    const edited = run(open(sampleSessionDetail('reviewing')), { type: 'FIELD_EDITED', update: { job_title: '改' } });
    const asked = run(edited, { type: 'FILE_SELECTED', file: pdf() });
    expect(asked).toMatchObject({ dialog: 'leave', busy: null });
    expect(run(asked, { type: 'LEAVE_CONFIRMED' })).toMatchObject({ busy: 'upload', dialog: null });
  });
});

describe('C. section editing', () => {
  it('confirming a section patches, then replaces the fields and drops that section buffer', () => {
    const edited = run(open(sampleSessionDetail('reviewing')), { type: 'FIELD_EDITED', update: { homepage: 'https://e.example', job_title: '改' } });
    const patching = run(edited, { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' });
    expect(patching.busy).toBe('patch');
    const fields = structuredClone(patching.draft!.fields);
    fields.homepage = { value: 'https://e.example', status: 'confirmed' };
    const s = run(patching, { type: 'PATCH_SUCCEEDED', response: { session_id: 'x', fields, updated_at: 't' }, section: 'basic', epoch: patching.epoch });
    expect(s.draft?.fields.homepage.value).toBe('https://e.example');
    expect(s.editBuffer).toEqual({ job_title: '改' });
    expect(s.busy).toBeNull();
  });

  it('422 keeps the buffer and maps details to fields; other failures keep the buffer too', () => {
    const patching = run(
      open(sampleSessionDetail('reviewing')),
      { type: 'FIELD_EDITED', update: { homepage: 'x' } },
      { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' },
    );
    const s = run(patching, { type: 'PATCH_FAILED', error: apiError('validation_failed', [{ field: 'email', reason: 'invalid_format' }]), epoch: patching.epoch });
    expect(s).toMatchObject({ busy: null, editBuffer: { homepage: 'x' }, fieldErrors: { email: 'invalid_format' } });
  });

  it('session_read_only on patch triggers a verifying read and then shows the saved view', () => {
    const patching = run(open(sampleSessionDetail('reviewing')), { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' });
    const reading = run(patching, { type: 'PATCH_FAILED', error: apiError('session_read_only'), epoch: patching.epoch });
    expect(reading).toMatchObject({ busy: 'read', readPurpose: 'sync' });
    const s = run(reading, { type: 'SESSION_SYNCED', detail: sampleSessionDetail('saved'), epoch: reading.epoch });
    expect(s).toMatchObject({ phase: 'saved', busy: null, draft: null });
    expect(s.error?.scope).toBe('section');
  });

  it('final view needs the unsubmitted edits resolved first', () => {
    const edited = run(open(sampleSessionDetail('reviewing')), { type: 'FIELD_EDITED', update: { job_title: '改' } });
    const asked = run(edited, { type: 'GO_FINAL_REQUESTED' });
    expect(asked.dialog).toBe('unsubmitted_edits');
    expect(run(asked, { type: 'DISCARD_EDITS_AND_GO_FINAL' })).toMatchObject({ view: 'final', editBuffer: {}, dialog: null });
  });
});

describe('D. chat and suggestions', () => {
  it('sends: busy chat with the known ids, success appends both messages', () => {
    const base = open(withCard());
    const sending = run(base, { type: 'SEND_REQUESTED', text: '哨兵-对话-0002' });
    expect(sending).toMatchObject({ busy: 'chat', pendingMessage: { stage: 'sending', knownIds: ['u1', 'a1'] } });
    const s = run(sending, { type: 'SEND_SUCCEEDED', response: sampleSendMessageResponse([]), epoch: sending.epoch });
    expect(s.messages).toHaveLength(4);
    expect(s).toMatchObject({ busy: null, pendingMessage: null });
  });

  it.each(['', '   ', 'x'.repeat(2001)])('ignores an unsendable text (%#)', (text) => {
    const base = open(sampleSessionDetail('reviewing'));
    expect(sessionReducer(base, { type: 'SEND_REQUESTED', text })).toBe(base);
  });

  it('chat_failed becomes "failed" (resend directly); a timeout becomes "unknown" (read first)', () => {
    const sending = run(open(sampleSessionDetail('reviewing')), { type: 'SEND_REQUESTED', text: 'hi' });
    const failed = run(sending, { type: 'SEND_FAILED', error: apiError('chat_failed'), epoch: sending.epoch });
    expect(failed.pendingMessage?.stage).toBe('failed');
    expect(run(failed, { type: 'MESSAGE_RETRY_REQUESTED' })).toMatchObject({ busy: 'chat', pendingMessage: { stage: 'sending' } });

    const unknown = run(sending, { type: 'SEND_FAILED', error: timeoutError(), epoch: sending.epoch });
    expect(unknown.pendingMessage?.stage).toBe('unknown');
    const verifying = run(unknown, { type: 'MESSAGE_RETRY_REQUESTED' });
    expect(verifying).toMatchObject({ busy: 'read', readPurpose: 'verify_message' });
    // Found on the server: take its messages; not found: send again.
    const found = run(verifying, { type: 'MESSAGE_VERIFIED', detail: withCard(), epoch: verifying.epoch });
    expect(found).toMatchObject({ busy: null, pendingMessage: null, messages: withCard().messages });
    expect(run(verifying, { type: 'MESSAGE_RESEND', epoch: verifying.epoch })).toMatchObject({ busy: 'chat', pendingMessage: { stage: 'sending' } });
  });

  it('discarding a pending message clears it without a request', () => {
    const sending = run(open(sampleSessionDetail('reviewing')), { type: 'SEND_REQUESTED', text: 'hi' });
    const failed = run(sending, { type: 'SEND_FAILED', error: apiError('chat_failed'), epoch: sending.epoch });
    expect(run(failed, { type: 'MESSAGE_DISCARDED' })).toMatchObject({ pendingMessage: null, error: null, busy: null });
  });

  it('applying a card replaces the fields and drops only the unsubmitted edits of applied fields', () => {
    const edited = run(open(withCard()), { type: 'FIELD_EDITED', update: { job_title: '手改', homepage: '留下' } });
    const applying = run(edited, { type: 'SUGGEST_REQUESTED', messageId: 'a1' });
    expect(applying.busy).toBe('suggest');
    const fields = structuredClone(applying.draft!.fields);
    fields.job_title = { value: '采购总监', status: 'confirmed' };
    const s = run(applying, {
      type: 'SUGGEST_SUCCEEDED',
      response: { message_id: 'a1', suggestions: [sampleSuggestion({ status: 'applied', old_value: null })], fields, updated_at: 't' },
      epoch: applying.epoch,
    });
    expect(s.draft?.fields.job_title.value).toBe('采购总监');
    expect(s.editBuffer).toEqual({ homepage: '留下' });
    expect(s.messages[1]?.suggestions[0]?.status).toBe('applied');
  });

  it('an already handled card (suggestion_unavailable) is re-read; a card that is not pending cannot be acted on', () => {
    const applying = run(open(withCard()), { type: 'SUGGEST_REQUESTED', messageId: 'a1' });
    const s = run(applying, { type: 'SUGGEST_FAILED', error: apiError('suggestion_unavailable'), messageId: 'a1', epoch: applying.epoch });
    expect(s).toMatchObject({ busy: 'read', readPurpose: 'sync', error: { scope: 'suggest', messageId: 'a1' } });
    const done = run(open(withCard()), { type: 'SUGGEST_REQUESTED', messageId: 'u1' });
    expect(done.busy).toBeNull();
  });
});

describe('E. final confirmation and save (F-03)', () => {
  it('asks about unconfirmed fields before saving', () => {
    const detail = allConfirmedDetail();
    detail.fields!.homepage = { value: null, status: 'missing' };
    const s = run(open(detail), { type: 'GO_FINAL_REQUESTED' }, { type: 'BACK_TO_SECTIONS' });
    expect(s.view).toBe('sections');
    const finalView = { ...s, view: 'final' as const };
    expect(run(finalView, { type: 'CONFIRM_REQUESTED' }).dialog).toBe('unconfirmed');
  });

  it('201 saves: saved phase with a summary and no notice; 200 already_saved: notice, no summary', () => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    expect(confirming).toMatchObject({ busy: 'confirm', phase: 'reviewing' });
    const detail = sampleSessionDetail('saved');
    const fresh = run(confirming, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse(), detail, readError: null, epoch: confirming.epoch });
    expect(fresh).toMatchObject({ phase: 'saved', draft: null, notice: null, savedSummary: { name: '测试用户甲', filename: '合成简历.pdf' } });
    const again = run(confirming, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse({ already_saved: true }), detail: sampleSessionDetail('pending'), readError: null, epoch: confirming.epoch });
    expect(again).toMatchObject({ phase: 'saved', notice: 'already_saved', savedSummary: null });
  });

  it('a successful save whose reload failed is still saved, with a read error to retry', () => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    const s = run(confirming, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse(), detail: null, readError: apiError('internal_error'), epoch: confirming.epoch });
    expect(s).toMatchObject({ phase: 'saved', saved: null, error: { scope: 'read' } });
  });

  it.each<ErrorCode>(['save_failed', 'internal_error', 'confirmation_required'])('%s stays in reviewing/final, nothing is "saved"', (code) => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    const s = run(confirming, { type: 'CONFIRM_FAILED', error: apiError(code), epoch: confirming.epoch });
    expect(s).toMatchObject({ phase: 'reviewing', view: 'final', busy: null, notice: null, savedSummary: null, error: { scope: 'confirm' } });
  });

  it.each([timeoutError(), ApiError.network(), ApiError.unknown(), apiError('session_read_only')])('unknown outcome (%s) reads the session before saying anything', (error) => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    const reading = run(confirming, { type: 'CONFIRM_FAILED', error, epoch: confirming.epoch });
    expect(reading).toMatchObject({ phase: 'reviewing', busy: 'read', readPurpose: 'verify_confirm', notice: null, savedSummary: null });
    // The server still says reviewing: not saved, retry allowed.
    const notSaved = run(reading, { type: 'CONFIRM_VERIFIED', detail: allConfirmedDetail(), epoch: reading.epoch });
    expect(notSaved).toMatchObject({ phase: 'reviewing', view: 'final', busy: null, notice: null, savedSummary: null });
    // The server says saved: now (and only now) the saved phase shows.
    const saved = run(reading, { type: 'CONFIRM_VERIFIED', detail: sampleSessionDetail('saved'), epoch: reading.epoch });
    expect(saved).toMatchObject({ phase: 'saved', notice: null, savedSummary: { name: '测试用户甲' } });
    const existing = run(reading, { type: 'CONFIRM_VERIFIED', detail: sampleSessionDetail('pending'), epoch: reading.epoch });
    expect(existing).toMatchObject({ phase: 'saved', notice: 'already_saved', savedSummary: null });
  });

  it('a failed verifying read is an error, not a success', () => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    const reading = run(confirming, { type: 'CONFIRM_FAILED', error: timeoutError(), epoch: confirming.epoch });
    const s = run(reading, { type: 'READ_FAILED', error: ApiError.network(), epoch: reading.epoch });
    expect(s).toMatchObject({ phase: 'reviewing', busy: null, savedSummary: null, error: { scope: 'confirm' } });
  });

  it('422 returns to the section with the error and ignores a stale success', () => {
    const confirming = run(readyToConfirm(), { type: 'CONFIRM_REQUESTED' });
    const s = run(confirming, { type: 'CONFIRM_FAILED', error: apiError('validation_failed', [{ field: 'phone', reason: 'invalid_format' }]), epoch: confirming.epoch });
    expect(s).toMatchObject({ view: 'sections', activeSection: 'basic', fieldErrors: { phone: 'invalid_format' } });
    expect(sessionReducer(confirming, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse(), detail: null, readError: null, epoch: confirming.epoch - 1 })).toBe(confirming);
  });
});

describe('F. confirmed update (F-03)', () => {
  const diffOpen = () => run(savedPending(), { type: 'DIFF_OPENED' });

  it('opening the diff card builds the diff without a request, shows no "updated", and needs a candidate', () => {
    const s = diffOpen();
    expect(s.diff?.changed.map((c) => [c.field, c.clears])).toEqual([['job_title', false], ['expected_salary', true]]);
    expect(s).toMatchObject({ busy: null, notice: 'already_saved' });
    const plain = open(sampleSessionDetail('saved'));
    expect(sessionReducer(plain, { type: 'DIFF_OPENED' })).toBe(plain);
    expect(run(s, { type: 'DIFF_CLOSED' }).diff).toBeNull();
  });

  it('the update request needs an open diff; success shows "updated" and the new record', () => {
    const updating = run(diffOpen(), { type: 'UPDATE_REQUESTED' });
    expect(updating.busy).toBe('update');
    expect(sessionReducer(savedPending(), { type: 'UPDATE_REQUESTED' }).busy).toBeNull();
    const s = run(updating, { type: 'UPDATE_SUCCEEDED', response: { resume_id: 'r', updated_at: 't' }, detail: sampleSessionDetail('applied'), readError: null, epoch: updating.epoch });
    expect(s).toMatchObject({ busy: null, diff: null, notice: 'updated', saved: { update_state: 'applied' } });
  });

  it.each([apiError('save_failed'), apiError('internal_error'), timeoutError(), ApiError.network(), ApiError.unknown()])(
    '%s keeps the diff card and never shows "updated"',
    (error) => {
      const updating = run(diffOpen(), { type: 'UPDATE_REQUESTED' });
      const s = run(updating, { type: 'UPDATE_FAILED', error, epoch: updating.epoch });
      expect(s).toMatchObject({ busy: null, notice: 'already_saved', error: { scope: 'update' } });
      expect(s.diff).not.toBeNull();
    },
  );

  it('update_not_available reads first; "applied" counts as updated, "pending" does not', () => {
    const updating = run(diffOpen(), { type: 'UPDATE_REQUESTED' });
    const reading = run(updating, { type: 'UPDATE_FAILED', error: apiError('update_not_available'), epoch: updating.epoch });
    expect(reading).toMatchObject({ busy: 'read', readPurpose: 'verify_update' });
    const applied = run(reading, { type: 'UPDATE_VERIFIED', detail: sampleSessionDetail('applied'), epoch: reading.epoch });
    expect(applied).toMatchObject({ notice: 'updated', diff: null });
    const pending = run(reading, { type: 'UPDATE_VERIFIED', detail: sampleSessionDetail('pending'), epoch: reading.epoch });
    expect(pending.notice).not.toBe('updated');
    expect(pending.diff).not.toBeNull();
  });

  it('after a timeout the user can re-read to verify', () => {
    const updating = run(diffOpen(), { type: 'UPDATE_REQUESTED' });
    const unknown = run(updating, { type: 'UPDATE_FAILED', error: timeoutError(), epoch: updating.epoch });
    const reading = run(unknown, { type: 'UPDATE_VERIFY_REQUESTED' });
    expect(reading).toMatchObject({ busy: 'read', readPurpose: 'verify_update' });
    expect(run(reading, { type: 'UPDATE_VERIFIED', detail: sampleSessionDetail('applied'), epoch: reading.epoch }).notice).toBe('updated');
  });
});

describe('G. delete and new chat', () => {
  it('delete asks first; deleting the current session empties the view, another one leaves it', () => {
    const base = open(sampleSessionDetail('reviewing'));
    const asked = run(base, { type: 'DELETE_REQUESTED', id: 'other', status: 'saved' });
    expect(asked).toMatchObject({ dialog: 'delete', dialogTarget: { kind: 'delete', id: 'other', status: 'saved' } });
    const deleting = run(asked, { type: 'DELETE_CONFIRMED' });
    expect(deleting.busy).toBe('delete');
    expect(run(deleting, { type: 'DELETE_SUCCEEDED', id: 'other', epoch: deleting.epoch })).toMatchObject({ phase: 'reviewing', busy: null });
    const current = run(base, { type: 'DELETE_REQUESTED', id: base.sessionId!, status: 'reviewing' }, { type: 'DELETE_CONFIRMED' });
    expect(run(current, { type: 'DELETE_SUCCEEDED', id: base.sessionId!, epoch: current.epoch })).toMatchObject({ phase: 'empty', sessionId: null, epoch: base.epoch + 1 });
  });

  it('a failed delete keeps the view and shows the error', () => {
    const deleting = run(open(sampleSessionDetail('saved')), { type: 'DELETE_REQUESTED', id: 'x', status: 'saved' }, { type: 'DELETE_CONFIRMED' });
    expect(run(deleting, { type: 'DELETE_FAILED', error: apiError('internal_error'), epoch: deleting.epoch })).toMatchObject({ phase: 'saved', busy: null, error: { scope: 'delete' } });
  });

  it('new chat clears the view without deleting; unsubmitted edits ask first', () => {
    const base = open(sampleSessionDetail('reviewing'));
    expect(run(base, { type: 'NEW_CHAT_REQUESTED' })).toMatchObject({ phase: 'empty', sessionId: null, draft: null, messages: [] });
    const edited = run(base, { type: 'FIELD_EDITED', update: { job_title: '改' } }, { type: 'NEW_CHAT_REQUESTED' });
    expect(edited).toMatchObject({ phase: 'reviewing', dialog: 'leave' });
    expect(run(edited, { type: 'LEAVE_CONFIRMED' })).toMatchObject({ phase: 'empty', dialog: null });
  });

  it('the saved view keeps no resume content outside saved.resume', () => {
    const s = savedPending();
    const copy = JSON.stringify({ ...s, saved: null, messages: [] });
    expect(copy).not.toContain('13800138000');
    expect(copy).not.toContain('test.user@example.com');
  });
});
