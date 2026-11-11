import { describe, expect, it } from 'vitest';
import {
  sampleArchivedResume,
  sampleCreateResumeResponse,
  sampleSendMessageResponse,
  sampleSessionDetail,
  sampleSessionSummary,
  sampleSuggestion,
} from '../test/ApiMocks';
import {
  isArchivedResume,
  isCreateResumeResponse,
  isResumeList,
  isSendMessageResponse,
  isSessionDetail,
  isSessionList,
  isSuggestionActionResponse,
  isUpdateResumeResponse,
} from './ResponseShapes';

describe('isCreateResumeResponse (F-03: only a well-formed save response may count as success)', () => {
  it('accepts the contract shape, with already_saved true or false', () => {
    expect(isCreateResumeResponse(sampleCreateResumeResponse())).toBe(true);
    expect(isCreateResumeResponse(sampleCreateResumeResponse({ already_saved: true }))).toBe(true);
  });

  it.each([
    ['empty object', {}],
    ['null', null],
    ['array', []],
    ['string', 'ok'],
    ['number', 1],
    ['missing already_saved', { resume_id: 'r1', saved_at: '2026-11-10T09:00:00Z' }],
    ['already_saved is a string', { ...sampleCreateResumeResponse(), already_saved: 'true' }],
    ['already_saved is a number', { ...sampleCreateResumeResponse(), already_saved: 1 }],
    ['already_saved is null', { ...sampleCreateResumeResponse(), already_saved: null }],
    ['missing resume_id', { already_saved: false, saved_at: '2026-11-10T09:00:00Z' }],
    ['empty resume_id', { ...sampleCreateResumeResponse(), resume_id: '' }],
    ['resume_id is a number', { ...sampleCreateResumeResponse(), resume_id: 7 }],
    ['missing saved_at', { resume_id: 'r1', already_saved: false }],
    ['saved_at is not a string', { ...sampleCreateResumeResponse(), saved_at: 12345 }],
    ['saved_at is not a date', { ...sampleCreateResumeResponse(), saved_at: 'garbage' }],
  ])('rejects %s', (_name, payload) => {
    expect(isCreateResumeResponse(payload)).toBe(false);
  });
});

describe('isSessionDetail (status, update_state and fields / resume / update_candidate must agree)', () => {
  it.each(['reviewing', 'saved', 'pending', 'applied'] as const)('accepts the %s sample', (kind) => {
    expect(isSessionDetail(sampleSessionDetail(kind))).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['reviewing without fields', { ...sampleSessionDetail('reviewing'), fields: null }],
    ['reviewing with a resume', { ...sampleSessionDetail('reviewing'), resume: sampleArchivedResume() }],
    ['reviewing with update_state pending', { ...sampleSessionDetail('reviewing'), update_state: 'pending' }],
    ['saved without resume', { ...sampleSessionDetail('saved'), resume: null }],
    ['saved that still carries fields', { ...sampleSessionDetail('saved'), fields: sampleSessionDetail('reviewing').fields }],
    ['pending without a candidate', { ...sampleSessionDetail('pending'), update_candidate: null }],
    ['applied that keeps a candidate', { ...sampleSessionDetail('applied'), update_candidate: sampleSessionDetail('pending').update_candidate }],
    ['unknown status', { ...sampleSessionDetail('saved'), status: 'draft' }],
    ['a suggestion outside the whitelist', { ...sampleSessionDetail('reviewing'), messages: [{ ...sampleSendMessageResponse().assistant_message, suggestions: [{ ...sampleSuggestion(), field: 'educations' }] }] }],
  ])('rejects %s', (_name, payload) => {
    expect(isSessionDetail(payload)).toBe(false);
  });
});

describe('other v2 response shapes', () => {
  it('accepts well-formed answers', () => {
    expect(isSessionList({ items: [sampleSessionSummary()] })).toBe(true);
    expect(isSendMessageResponse(sampleSendMessageResponse())).toBe(true);
    expect(isSuggestionActionResponse({ message_id: 'm1', suggestions: [sampleSuggestion({ status: 'applied', old_value: null })], fields: sampleSessionDetail('reviewing').fields, updated_at: '2026-11-10T09:00:00Z' })).toBe(true);
    expect(isUpdateResumeResponse({ resume_id: 'r1', updated_at: '2026-11-10T09:00:00Z' })).toBe(true);
    expect(isArchivedResume(sampleArchivedResume())).toBe(true);
    expect(isResumeList({ items: [{ resume_id: 'r1', name: 'n', phone: 'p', email: 'e', job_title: null, saved_at: '2026-11-10T09:00:00Z' }] })).toBe(true);
  });

  it('rejects a send response with swapped roles, an update answer without a time, and a list without items', () => {
    const ok = sampleSendMessageResponse();
    expect(isSendMessageResponse({ user_message: ok.assistant_message, assistant_message: ok.user_message })).toBe(false);
    expect(isUpdateResumeResponse({ resume_id: 'r1' })).toBe(false);
    expect(isSessionList({})).toBe(false);
    expect(isArchivedResume({ ...sampleArchivedResume(), fields: { name: 'x' } })).toBe(false);
  });
});
