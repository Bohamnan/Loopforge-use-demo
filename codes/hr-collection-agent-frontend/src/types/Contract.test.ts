import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ArchivedResume } from './Archive';
import { CHAT_ROLES, SUGGESTION_REASONS, SUGGESTION_STATUSES, type SuggestionValue } from './Conversation';
import {
  ERROR_CODES,
  ERROR_REASONS,
  type ApiErrorCode,
  type ClientErrorCode,
  type ErrorCode,
  type ErrorDetail,
  type ErrorResponse,
} from './Errors';
import type { CreateResumeRequest, CreateResumeResponse, UpdateResumeRequest } from './Resume';
import { SESSION_STATUSES, UPDATE_STATES, type OriginalFileInfo, type SessionDetail } from './Session';
import {
  FIELD_STATUSES,
  OPENAPI_VERSION,
  RESUME_FIELD_KEYS,
  SUGGESTION_FIELDS,
  type FieldStatus,
  type ResumeFields,
  type ResumeFieldsUpdate,
  type ResumeValues,
  type StringField,
  type StringListField,
  type WorkExperienceListField,
} from './ResumeModel';

// Expected values are copied from backend-docs/HR_PR-1/03_api/openapi.yaml (0.2.0) on purpose:
// this test fails when the hand-written types drift from the contract (F-02).
describe('OpenAPI 0.2.0 contract mirror', () => {
  it('declares the contract version', () => {
    expect(OPENAPI_VERSION).toBe('0.2.0');
  });

  it('has the 22 resume field keys in contract order', () => {
    expect([...RESUME_FIELD_KEYS]).toEqual([
      'name',
      'job_title',
      'expected_city',
      'expected_salary',
      'available_time',
      'phone',
      'email',
      'homepage',
      'gender',
      'birth_month',
      'political_status',
      'current_city',
      'work_years',
      'highest_education',
      'strengths',
      'work_experiences',
      'project_experiences',
      'educations',
      'skills',
      'certificates_honors',
      'languages',
      'self_evaluation',
    ]);
    expect(new Set(RESUME_FIELD_KEYS).size).toBe(22);
  });

  it('has the 4 field statuses', () => {
    expect([...FIELD_STATUSES]).toEqual(['recognized', 'uncertain', 'missing', 'confirmed']);
  });

  it('has the 19 backend error codes', () => {
    expect([...ERROR_CODES]).toEqual([
      'file_missing',
      'file_empty',
      'file_content_mismatch',
      'file_too_large',
      'unsupported_file_type',
      'parse_failed',
      'parse_unavailable',
      'parse_timeout',
      'session_not_found',
      'session_read_only',
      'validation_failed',
      'confirmation_required',
      'chat_failed',
      'suggestion_unavailable',
      'update_not_available',
      'resume_not_found',
      'file_not_available',
      'save_failed',
      'internal_error',
    ]);
  });

  it('has the 5 error detail reasons', () => {
    expect([...ERROR_REASONS]).toEqual(['required', 'invalid_format', 'invalid_type', 'too_long', 'unknown_field']);
  });

  it('keeps ResumeFields and ResumeFieldsUpdate keys aligned with the key list', () => {
    expectTypeOf<keyof ResumeFields>().toEqualTypeOf<(typeof RESUME_FIELD_KEYS)[number]>();
    expectTypeOf<keyof ResumeFieldsUpdate>().toEqualTypeOf<(typeof RESUME_FIELD_KEYS)[number]>();
  });

  it('types scalar values as nullable and list values as arrays', () => {
    expectTypeOf<StringField['value']>().toEqualTypeOf<string | null>();
    expectTypeOf<StringListField['value']>().toEqualTypeOf<string[]>();
    expectTypeOf<WorkExperienceListField['value'][number]['responsibilities']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<StringField['status']>().toEqualTypeOf<FieldStatus>();
  });

  it('requires the three core fields in ResumeFieldsUpdate to be non-null strings when present', () => {
    expectTypeOf<NonNullable<ResumeFieldsUpdate['name']>>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<ResumeFieldsUpdate['phone']>>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<ResumeFieldsUpdate['email']>>().toEqualTypeOf<string>();
    expectTypeOf<ResumeFieldsUpdate['job_title']>().toEqualTypeOf<string | null | undefined>();
  });

  it('keeps client error codes out of the contract ErrorCode', () => {
    expectTypeOf<ClientErrorCode>().toEqualTypeOf<'client_timeout' | 'network_error' | 'unknown_error'>();
    expectTypeOf<ApiErrorCode>().toEqualTypeOf<ErrorCode | ClientErrorCode>();
    expect(ERROR_CODES as readonly string[]).not.toContain('client_timeout');
  });

  it('models the response shapes', () => {
    expectTypeOf<OriginalFileInfo['content_type']>().toEqualTypeOf<'application/pdf' | 'image/jpeg' | 'image/png'>();
    expectTypeOf<CreateResumeRequest>().toEqualTypeOf<{ confirmed: boolean }>();
    expectTypeOf<CreateResumeResponse['already_saved']>().toEqualTypeOf<boolean>();
    expectTypeOf<ErrorResponse['details']>().toEqualTypeOf<ErrorDetail[] | undefined>();
  });

  it('has the v2 session, suggestion and chat enums', () => {
    expect([...SESSION_STATUSES]).toEqual(['reviewing', 'saved']);
    expect([...UPDATE_STATES]).toEqual(['none', 'pending', 'applied']);
    expect([...SUGGESTION_STATUSES]).toEqual(['pending', 'applied', 'cancelled']);
    expect([...SUGGESTION_REASONS]).toEqual(['required', 'invalid_format', 'invalid_type', 'too_long']);
    expect([...CHAT_ROLES]).toEqual(['user', 'assistant']);
    expect(SUGGESTION_FIELDS).toHaveLength(19);
    // Whitelist = the 22 fields minus the three experience lists.
    const lists = ['work_experiences', 'project_experiences', 'educations'];
    expect([...SUGGESTION_FIELDS].sort()).toEqual(RESUME_FIELD_KEYS.filter((k) => !lists.includes(k)).sort());
  });

  it('models the v2 session shapes', () => {
    expectTypeOf<keyof ResumeValues>().toEqualTypeOf<(typeof RESUME_FIELD_KEYS)[number]>();
    expectTypeOf<SessionDetail['fields']>().toEqualTypeOf<ResumeFields | null>();
    expectTypeOf<SessionDetail['resume']>().toEqualTypeOf<ArchivedResume | null>();
    expectTypeOf<SuggestionValue>().toEqualTypeOf<string | string[] | null>();
    expectTypeOf<UpdateResumeRequest>().toEqualTypeOf<{ confirm_update: boolean }>();
  });
});
