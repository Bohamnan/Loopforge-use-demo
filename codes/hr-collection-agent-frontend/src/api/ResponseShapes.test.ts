import { describe, expect, it } from 'vitest';
import { sampleCreateResumeResponse, sampleDraft } from '../test/ApiMocks';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import { isCreateResumeResponse, isDraftResponse } from './ResponseShapes';

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

describe('isDraftResponse (the UI reads every field, so an incomplete draft must not get in)', () => {
  it('accepts the contract shape', () => {
    expect(isDraftResponse(sampleDraft())).toBe(true);
  });

  it.each([
    ['empty object', {}],
    ['null', null],
    ['array', []],
    ['missing fields', { ...sampleDraft(), fields: undefined }],
    ['fields is empty', { ...sampleDraft(), fields: {} }],
    ['missing original_file', { ...sampleDraft(), original_file: undefined }],
    ['original_file without filename', { ...sampleDraft(), original_file: { size_bytes: 1 } }],
    ['missing draft_id', { ...sampleDraft(), draft_id: undefined }],
    ['missing expires_at', { ...sampleDraft(), expires_at: undefined }],
  ])('rejects %s', (_name, payload) => {
    expect(isDraftResponse(payload)).toBe(false);
  });

  it.each(RESUME_FIELD_KEYS)('rejects a draft that lacks the field %s', (key) => {
    const draft = sampleDraft() as unknown as { fields: Record<string, unknown> };
    delete draft.fields[key];
    expect(isDraftResponse(draft)).toBe(false);
  });

  it('rejects a field with an unknown status or without a value', () => {
    const bad = sampleDraft() as unknown as { fields: Record<string, unknown> };
    bad.fields.name = { value: 'x', status: 'saved' };
    expect(isDraftResponse(bad)).toBe(false);
    const noValue = sampleDraft() as unknown as { fields: Record<string, unknown> };
    noValue.fields.name = { status: 'confirmed' };
    expect(isDraftResponse(noValue)).toBe(false);
  });

  it('rejects list fields whose value is not an array and scalar fields whose value is an object', () => {
    const a = sampleDraft() as unknown as { fields: Record<string, unknown> };
    a.fields.skills = { value: 'Excel', status: 'recognized' };
    expect(isDraftResponse(a)).toBe(false);
    const b = sampleDraft() as unknown as { fields: Record<string, unknown> };
    b.fields.name = { value: { x: 1 }, status: 'recognized' };
    expect(isDraftResponse(b)).toBe(false);
  });
});
