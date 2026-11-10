import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/ApiError';
import { sampleCreateResumeResponse, sampleDraft, sampleFields } from '../../test/ApiMocks';
import type { DraftResponse } from '../../types/Draft';
import type { ErrorCode } from '../../types/Errors';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import { initialState, sessionReducer, type SessionAction, type SessionState } from './SessionReducer';

const pdf = () => new File(['x'], '合成简历.pdf', { type: 'application/pdf' });
const apiError = (code: ErrorCode, details?: ApiError['details']) =>
  new ApiError({ code, message: '后端提示', status: 400, request_id: 'req_1', details });

function run(state: SessionState, ...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state);
}

function allConfirmed(): DraftResponse {
  const draft = sampleDraft();
  for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
  return draft;
}

/** reviewing / sections with the default sample draft. */
function reviewing(draft: DraftResponse = sampleDraft()): SessionState {
  return run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft, epoch: 0 });
}

describe('bootstrap', () => {
  it('starts in bootstrapping', () => {
    const s = initialState();
    expect(s).toMatchObject({ phase: 'bootstrapping', busy: null, draft: null, epoch: 0 });
  });

  it('GET 200 restores the draft into reviewing/sections with a restored notice', () => {
    const s = reviewing();
    expect(s).toMatchObject({ phase: 'reviewing', view: 'sections', restored: true, busy: null });
    expect(s.notice).toBe('restored');
    expect(s.draft).not.toBeNull();
    expect(s.activeSection).toBe('basic');
  });

  it('selects the first section needing attention when restoring', () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    draft.fields.work_years.status = 'uncertain';
    expect(reviewing(draft).activeSection).toBe('personal');
  });

  it('goes straight to the final view when everything is confirmed', () => {
    expect(reviewing(allConfirmed())).toMatchObject({ phase: 'reviewing', view: 'final' });
  });

  it('GET 404 (null) goes to the empty state without error or notice', () => {
    const s = run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft: null, epoch: 0 });
    expect(s).toMatchObject({ phase: 'empty', draft: null, error: null, notice: null });
  });

  it('other GET failures go to bootstrap_failed (never the empty state)', () => {
    const s = run(initialState(), { type: 'BOOTSTRAP_FAILED', error: apiError('internal_error'), epoch: 0 });
    expect(s.phase).toBe('bootstrap_failed');
    expect(s.error?.scope).toBe('bootstrap');
  });

  it('retry returns to bootstrapping and clears the error', () => {
    const failed = run(initialState(), { type: 'BOOTSTRAP_FAILED', error: apiError('internal_error'), epoch: 0 });
    const s = run(failed, { type: 'BOOTSTRAP_RETRY' });
    expect(s).toMatchObject({ phase: 'bootstrapping', error: null });
  });

  it('ignores a bootstrap response with a stale epoch', () => {
    const s = run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft: sampleDraft(), epoch: 5 });
    expect(s.phase).toBe('bootstrapping');
  });
});

describe('upload', () => {
  const empty = () => run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft: null, epoch: 0 });

  it('starts uploading directly when there is no draft', () => {
    const s = run(empty(), { type: 'FILE_SELECTED', file: pdf() });
    expect(s).toMatchObject({ busy: 'upload', dialog: null, error: null });
    expect(s.pendingFile).not.toBeNull();
  });

  it('a precheck failure sets a local error and sends nothing', () => {
    const bad = new File(['x'], 'a.docx', { type: 'text/plain' });
    const s = run(empty(), { type: 'FILE_SELECTED', file: bad });
    expect(s.busy).toBeNull();
    expect(s.error).toMatchObject({ scope: 'upload', cause: { kind: 'local' } });
  });

  it('asks for overwrite confirmation when a draft exists', () => {
    const s = run(reviewing(), { type: 'FILE_SELECTED', file: pdf() });
    expect(s).toMatchObject({ busy: null, dialog: 'overwrite' });
    expect(s.pendingFile).not.toBeNull();
  });

  it('cancelling the overwrite dialog sends nothing and keeps the draft', () => {
    const s = run(reviewing(), { type: 'FILE_SELECTED', file: pdf() }, { type: 'OVERWRITE_CANCELLED' });
    expect(s).toMatchObject({ busy: null, dialog: null, pendingFile: null });
    expect(s.draft).not.toBeNull();
  });

  it('confirming the overwrite starts the upload', () => {
    const s = run(reviewing(), { type: 'FILE_SELECTED', file: pdf() }, { type: 'OVERWRITE_CONFIRMED' });
    expect(s).toMatchObject({ busy: 'upload', dialog: null });
  });

  it('OVERWRITE_CONFIRMED without a pending overwrite is ignored', () => {
    const before = reviewing();
    expect(run(before, { type: 'OVERWRITE_CONFIRMED' })).toBe(before);
  });

  it('ignores new files while a request is in flight (no duplicate submit)', () => {
    const uploading = run(empty(), { type: 'FILE_SELECTED', file: pdf() });
    expect(run(uploading, { type: 'FILE_SELECTED', file: pdf() })).toBe(uploading);
  });

  it('201 replaces the draft and resets edits, notices and errors', () => {
    const edited = run(
      reviewing(),
      { type: 'FIELD_EDITED', update: { job_title: '改过' } },
      { type: 'FILE_SELECTED', file: pdf() },
      { type: 'OVERWRITE_CONFIRMED' },
    );
    const next = sampleDraft({ draft_id: '00000000-0000-4000-8000-0000000000aa' });
    const s = run(edited, { type: 'UPLOAD_SUCCEEDED', draft: next, epoch: edited.epoch });
    expect(s).toMatchObject({
      phase: 'reviewing',
      view: 'sections',
      busy: null,
      restored: false,
      notice: null,
      error: null,
      pendingFile: null,
      overwriteAcknowledged: false,
    });
    expect(s.draft?.draft_id).toBe(next.draft_id);
    expect(s.editBuffer).toEqual({});
  });

  it('a failed upload keeps the old draft and view (O-02) and records the error', () => {
    const before = run(reviewing(), { type: 'FILE_SELECTED', file: pdf() }, { type: 'OVERWRITE_CONFIRMED' });
    const s = run(before, { type: 'UPLOAD_FAILED', error: apiError('parse_failed'), epoch: before.epoch });
    expect(s).toMatchObject({ phase: 'reviewing', busy: null, pendingFile: null });
    expect(s.draft).toBe(before.draft);
    expect(s.error).toMatchObject({ scope: 'upload' });
  });

  it('a timeout leaves the empty state as it was', () => {
    const before = run(empty(), { type: 'FILE_SELECTED', file: pdf() });
    const s = run(before, { type: 'UPLOAD_FAILED', error: ApiError.timeout(), epoch: before.epoch });
    expect(s).toMatchObject({ phase: 'empty', busy: null });
    expect((s.error?.cause as ApiError).code).toBe('client_timeout');
  });

  it('ignores a stale upload response', () => {
    const uploading = run(empty(), { type: 'FILE_SELECTED', file: pdf() });
    const s = run(uploading, { type: 'UPLOAD_SUCCEEDED', draft: sampleDraft(), epoch: uploading.epoch + 1 });
    expect(s).toBe(uploading);
  });

  it('after a confirmed new chat the first upload needs no second overwrite confirmation', () => {
    const cleared = run(reviewing(), { type: 'NEW_CHAT_REQUESTED' }, { type: 'NEW_CHAT_CONFIRMED' });
    expect(cleared.overwriteAcknowledged).toBe(true);
    expect(run(cleared, { type: 'FILE_SELECTED', file: pdf() })).toMatchObject({ busy: 'upload', dialog: null });
  });
});

describe('editing and section confirmation', () => {
  it('buffers edits without touching the authoritative draft', () => {
    const base = reviewing();
    const s = run(base, { type: 'FIELD_EDITED', update: { job_title: '新岗位' } });
    expect(s.editBuffer).toEqual({ job_title: '新岗位' });
    expect(s.draft).toBe(base.draft);
    expect(s.draft?.fields.job_title.status).toBe('recognized');
  });

  it('clears field errors of an edited field, including indexed paths', () => {
    const withErrors: SessionState = {
      ...reviewing(),
      fieldErrors: { phone: 'invalid_format', 'work_experiences[0].company': 'too_long', email: 'required' },
    };
    const s = run(withErrors, { type: 'FIELD_EDITED', update: { work_experiences: [] } }, { type: 'FIELD_EDITED', update: { phone: '1' } });
    expect(s.fieldErrors).toEqual({ email: 'required' });
  });

  it('switches the active section', () => {
    expect(run(reviewing(), { type: 'SECTION_SELECTED', section: 'work' }).activeSection).toBe('work');
  });

  it('a locally invalid section sends nothing and records field errors', () => {
    const s = run(reviewing(), { type: 'FIELD_EDITED', update: { phone: '123' } }, { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' });
    expect(s.busy).toBeNull();
    expect(s.fieldErrors).toMatchObject({ phone: 'invalid_format' });
  });

  it('a valid section starts a PATCH', () => {
    const s = run(reviewing(), { type: 'FIELD_EDITED', update: { phone: '13800138000' } }, { type: 'SECTION_CONFIRM_REQUESTED', section: 'basic' });
    expect(s).toMatchObject({ busy: 'patch' });
    expect(s.fieldErrors).toEqual({});
  });

  it('ignores a second section confirmation while one is in flight', () => {
    const inFlight = run(reviewing(), { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' });
    expect(inFlight.busy).toBe('patch');
    expect(run(inFlight, { type: 'SECTION_CONFIRM_REQUESTED', section: 'personal' })).toBe(inFlight);
  });

  it('PATCH 200 replaces the draft, drops that section\'s buffered edits and advances to the next unconfirmed section', () => {
    const base = run(
      reviewing(),
      { type: 'FIELD_EDITED', update: { job_title: 'X', skills: ['A'] } },
      { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' },
    );
    const updated = sampleDraft();
    updated.fields.job_title = { value: 'X', status: 'confirmed' };
    updated.fields.expected_city.status = 'confirmed';
    updated.fields.expected_salary.status = 'confirmed';
    updated.fields.available_time.status = 'confirmed';
    for (const k of ['name', 'phone', 'email', 'homepage'] as const) updated.fields[k].status = 'confirmed';
    const s = run(base, { type: 'PATCH_SUCCEEDED', draft: updated, section: 'intent', epoch: base.epoch });
    expect(s.busy).toBeNull();
    expect(s.draft).toBe(updated);
    expect(s.editBuffer).toEqual({ skills: ['A'] });
    expect(s.activeSection).toBe('personal');
    expect(s.view).toBe('sections');
  });

  it('moves to the final view when nothing is left unconfirmed', () => {
    const base = run(reviewing(), { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' });
    const s = run(base, { type: 'PATCH_SUCCEEDED', draft: allConfirmed(), section: 'intent', epoch: base.epoch });
    expect(s.view).toBe('final');
  });

  it('PATCH 422 keeps the buffer, maps details to field errors and does not leave the view', () => {
    const base = run(
      reviewing(),
      { type: 'FIELD_EDITED', update: { work_experiences: [{ start_date: 'x' }] } },
      { type: 'SECTION_CONFIRM_REQUESTED', section: 'work' },
    );
    const s = run(base, {
      type: 'PATCH_FAILED',
      error: apiError('validation_failed', [{ field: 'work_experiences[0].start_date', reason: 'too_long' }]),
      epoch: base.epoch,
    });
    expect(s.busy).toBeNull();
    expect(s.fieldErrors).toEqual({ 'work_experiences[0].start_date': 'too_long' });
    expect(s.editBuffer).toEqual({ work_experiences: [{ start_date: 'x' }] });
    expect(s.phase).toBe('reviewing');
    expect(s.error?.scope).toBe('section');
  });

  it('PATCH draft_not_found clears everything and shows the expired notice (O-10)', () => {
    const base = run(reviewing(), { type: 'FIELD_EDITED', update: { job_title: 'X' } }, { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' });
    const s = run(base, { type: 'PATCH_FAILED', error: apiError('draft_not_found'), epoch: base.epoch });
    expect(s).toMatchObject({ phase: 'empty', draft: null, notice: 'draft_expired', busy: null });
    expect(s.editBuffer).toEqual({});
  });

  it.each([ApiError.timeout(), ApiError.network(), apiError('internal_error')])('PATCH failure %# keeps buffer and view for a retry', (error) => {
    const base = run(reviewing(), { type: 'FIELD_EDITED', update: { job_title: 'X' } }, { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' });
    const s = run(base, { type: 'PATCH_FAILED', error, epoch: base.epoch });
    expect(s).toMatchObject({ phase: 'reviewing', busy: null });
    expect(s.editBuffer).toEqual({ job_title: 'X' });
    expect(s.error?.scope).toBe('section');
  });
});

describe('final confirmation', () => {
  const finalState = (draft = allConfirmed()) => {
    const state = reviewing(draft);
    return state.view === 'final' ? state : run(state, { type: 'GO_FINAL_REQUESTED' });
  };

  it('GO_FINAL moves to the final view when there are no unsubmitted edits', () => {
    expect(run(reviewing(), { type: 'GO_FINAL_REQUESTED' }).view).toBe('final');
  });

  it('GO_FINAL with unsubmitted edits asks first', () => {
    const s = run(reviewing(), { type: 'FIELD_EDITED', update: { job_title: 'X' } }, { type: 'GO_FINAL_REQUESTED' });
    expect(s).toMatchObject({ view: 'sections', dialog: 'unsubmitted_edits' });
  });

  it('discarding edits then continues to the final view', () => {
    const s = run(
      reviewing(),
      { type: 'FIELD_EDITED', update: { job_title: 'X' } },
      { type: 'GO_FINAL_REQUESTED' },
      { type: 'DISCARD_EDITS_AND_GO_FINAL' },
    );
    expect(s).toMatchObject({ view: 'final', dialog: null });
    expect(s.editBuffer).toEqual({});
  });

  it('BACK_TO_SECTIONS returns to the first section needing attention', () => {
    const s = run(reviewing(), { type: 'GO_FINAL_REQUESTED' }, { type: 'BACK_TO_SECTIONS' });
    expect(s).toMatchObject({ view: 'sections', activeSection: 'basic' });
  });

  it('CONFIRM is ignored when the core fields are not ready', () => {
    const final = run(reviewing(), { type: 'GO_FINAL_REQUESTED' });
    expect(run(final, { type: 'CONFIRM_REQUESTED' })).toBe(final);
  });

  it('CONFIRM with unconfirmed non-core fields asks first and sends nothing', () => {
    const draft = allConfirmed();
    draft.fields.gender.status = 'missing';
    const s = run(finalState(draft), { type: 'GO_FINAL_REQUESTED' }, { type: 'CONFIRM_REQUESTED' });
    expect(s).toMatchObject({ busy: null, dialog: 'unconfirmed' });
  });

  it('cancelling the unconfirmed dialog sends nothing', () => {
    const draft = allConfirmed();
    draft.fields.gender.status = 'missing';
    const s = run(finalState(draft), { type: 'CONFIRM_REQUESTED' }, { type: 'DIALOG_DISMISSED' });
    expect(s).toMatchObject({ busy: null, dialog: null, view: 'final' });
  });

  it('continuing from the unconfirmed dialog sends the confirmation', () => {
    const draft = allConfirmed();
    draft.fields.gender.status = 'missing';
    const s = run(finalState(draft), { type: 'CONFIRM_REQUESTED' }, { type: 'CONFIRM_PROCEEDED' });
    expect(s).toMatchObject({ busy: 'confirm', dialog: null });
  });

  it('CONFIRM with everything confirmed sends directly', () => {
    expect(run(finalState(), { type: 'CONFIRM_REQUESTED' })).toMatchObject({ busy: 'confirm', dialog: null });
  });

  it('prevents a second confirmation while one is in flight', () => {
    const inFlight = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    expect(run(inFlight, { type: 'CONFIRM_REQUESTED' })).toBe(inFlight);
  });

  it('success (already_saved=false) shows the saved summary and clears the resume content', () => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const s = run(base, {
      type: 'CONFIRM_SUCCEEDED',
      response: sampleCreateResumeResponse({ already_saved: false, saved_at: '2026-11-10T09:00:00Z' }),
      epoch: base.epoch,
    });
    expect(s).toMatchObject({ phase: 'saved', draft: null, busy: null, notice: null });
    expect(s.savedSummary).toEqual({ name: '测试用户甲', filename: '合成简历.pdf', saved_at: '2026-11-10T09:00:00Z' });
    expect(s.editBuffer).toEqual({});
    expect(JSON.stringify(s)).not.toContain('13800138000');
    expect(JSON.stringify(s)).not.toContain('test.user@example.com');
  });

  it('success (already_saved=true) shows only the already-saved notice, no summary', () => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const s = run(base, {
      type: 'CONFIRM_SUCCEEDED',
      response: sampleCreateResumeResponse({ already_saved: true }),
      epoch: base.epoch,
    });
    expect(s).toMatchObject({ phase: 'saved', notice: 'already_saved', savedSummary: null, draft: null });
  });

  it('draft_not_found shows "maybe saved", never a success state', () => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const s = run(base, { type: 'CONFIRM_FAILED', error: apiError('draft_not_found'), epoch: base.epoch });
    expect(s).toMatchObject({ phase: 'empty', notice: 'maybe_saved', draft: null, savedSummary: null });
  });

  it('422 returns to the sections view on the section of the first failing field', () => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const s = run(base, {
      type: 'CONFIRM_FAILED',
      error: apiError('validation_failed', [
        { field: 'educations[0].school', reason: 'too_long' },
        { field: 'phone', reason: 'invalid_format' },
      ]),
      epoch: base.epoch,
    });
    expect(s).toMatchObject({ phase: 'reviewing', view: 'sections', activeSection: 'education', busy: null });
    expect(s.fieldErrors).toEqual({ 'educations[0].school': 'too_long', phone: 'invalid_format' });
  });

  it.each([
    ['timeout', ApiError.timeout()],
    ['network', ApiError.network()],
    ['internal_error', apiError('internal_error')],
    ['save_failed', apiError('save_failed')],
    ['confirmation_required', apiError('confirmation_required')],
    ['unknown_error', ApiError.unknown(502)],
  ])('%s stays on the final view with an error, never a success state, and allows a retry', (_name, error) => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const failed = run(base, { type: 'CONFIRM_FAILED', error, epoch: base.epoch });
    expect(failed).toMatchObject({ phase: 'reviewing', view: 'final', busy: null, savedSummary: null });
    expect(failed.error?.scope).toBe('confirm');
    expect(failed.draft).not.toBeNull();
    expect(run(failed, { type: 'CONFIRM_REQUESTED' }).busy).toBe('confirm');
  });

  it('ignores a stale confirmation response', () => {
    const base = run(finalState(), { type: 'CONFIRM_REQUESTED' });
    const s = run(base, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse(), epoch: base.epoch + 1 });
    expect(s).toBe(base);
  });
});

describe('new chat', () => {
  it('asks for confirmation when an unconfirmed draft exists', () => {
    expect(run(reviewing(), { type: 'NEW_CHAT_REQUESTED' })).toMatchObject({ dialog: 'new_chat', phase: 'reviewing' });
  });

  it('cancelling keeps everything', () => {
    const before = reviewing();
    const s = run(before, { type: 'NEW_CHAT_REQUESTED' }, { type: 'DIALOG_DISMISSED' });
    expect(s.draft).toBe(before.draft);
    expect(s.dialog).toBeNull();
  });

  it('confirming clears the UI state, bumps the epoch and acknowledges the overwrite', () => {
    const before = run(reviewing(), { type: 'FIELD_EDITED', update: { job_title: 'X' } });
    const s = run(before, { type: 'NEW_CHAT_REQUESTED' }, { type: 'NEW_CHAT_CONFIRMED' });
    expect(s).toMatchObject({ phase: 'empty', draft: null, dialog: null, overwriteAcknowledged: true, notice: null, error: null });
    expect(s.editBuffer).toEqual({});
    expect(s.epoch).toBe(before.epoch + 1);
  });

  it('resets immediately (no dialog) from the empty state', () => {
    const empty = run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft: null, epoch: 0 });
    const s = run(empty, { type: 'NEW_CHAT_REQUESTED' });
    expect(s).toMatchObject({ phase: 'empty', dialog: null, overwriteAcknowledged: false });
  });

  it('resets immediately from the saved state and clears the summary', () => {
    const base = run(reviewing(allConfirmed()), { type: 'CONFIRM_REQUESTED' });
    const saved = run(base, { type: 'CONFIRM_SUCCEEDED', response: sampleCreateResumeResponse(), epoch: base.epoch });
    const s = run(saved, { type: 'UPLOAD_NEXT' });
    expect(s).toMatchObject({ phase: 'empty', savedSummary: null, notice: null, dialog: null });
    expect(run(saved, { type: 'NEW_CHAT_REQUESTED' }).phase).toBe('empty');
  });

  it('is ignored while a request is in flight', () => {
    const uploading = run(run(initialState(), { type: 'BOOTSTRAP_SUCCEEDED', draft: null, epoch: 0 }), { type: 'FILE_SELECTED', file: pdf() });
    expect(run(uploading, { type: 'NEW_CHAT_REQUESTED' })).toBe(uploading);
  });

  it('discards a response that arrives after the new chat (stale epoch)', () => {
    const inFlight = run(reviewing(), { type: 'SECTION_CONFIRM_REQUESTED', section: 'intent' });
    const afterReset = { ...inFlight, busy: null as null }; // the UI blocks reset while busy; simulate a late reset
    const reset = run(afterReset, { type: 'NEW_CHAT_REQUESTED' }, { type: 'NEW_CHAT_CONFIRMED' });
    const s = run(reset, { type: 'PATCH_SUCCEEDED', draft: sampleDraft(), section: 'intent', epoch: inFlight.epoch });
    expect(s).toBe(reset);
  });
});

describe('notices and state hygiene', () => {
  it('dismisses the restored notice', () => {
    expect(run(reviewing(), { type: 'NOTICE_DISMISSED' }).notice).toBeNull();
  });

  it('never stores browser-persistable resume content outside the draft and buffer', () => {
    const s = run(reviewing(), { type: 'GO_FINAL_REQUESTED' });
    expect(Object.keys(s).sort()).toEqual(
      [
        'activeSection',
        'busy',
        'dialog',
        'draft',
        'editBuffer',
        'epoch',
        'error',
        'fieldErrors',
        'notice',
        'overwriteAcknowledged',
        'pendingFile',
        'phase',
        'restored',
        'savedSummary',
        'view',
      ].sort(),
    );
    expect(sampleFields().name.value).toBe('测试用户甲');
  });
});
