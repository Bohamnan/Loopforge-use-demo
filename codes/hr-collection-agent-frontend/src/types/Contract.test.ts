import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DraftResponse, OriginalFileInfo } from './Draft';
import {
  ERROR_CODES,
  ERROR_REASONS,
  type ApiErrorCode,
  type ClientErrorCode,
  type ErrorCode,
  type ErrorDetail,
  type ErrorResponse,
} from './Errors';
import type { CreateResumeRequest, CreateResumeResponse } from './Resume';
import {
  FIELD_STATUSES,
  OPENAPI_VERSION,
  RESUME_FIELD_KEYS,
  type FieldStatus,
  type ResumeFields,
  type ResumeFieldsUpdate,
  type StringField,
  type StringListField,
  type WorkExperienceListField,
} from './ResumeModel';

// Expected values are copied from backend-docs/HR_PR-1/03_api/openapi.yaml (0.1.1) on purpose:
// this test fails when the hand-written types drift from the contract (F-02).
describe('OpenAPI 0.1.1 contract mirror', () => {
  it('declares the contract version', () => {
    expect(OPENAPI_VERSION).toBe('0.1.1');
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

  it('has the 13 backend error codes', () => {
    expect([...ERROR_CODES]).toEqual([
      'file_missing',
      'file_empty',
      'file_content_mismatch',
      'file_too_large',
      'unsupported_file_type',
      'parse_failed',
      'parse_unavailable',
      'parse_timeout',
      'draft_not_found',
      'validation_failed',
      'confirmation_required',
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
    expectTypeOf<DraftResponse>().toHaveProperty('expires_at');
    expectTypeOf<CreateResumeRequest>().toEqualTypeOf<{ confirmed: boolean }>();
    expectTypeOf<CreateResumeResponse['already_saved']>().toEqualTypeOf<boolean>();
    expectTypeOf<ErrorResponse['details']>().toEqualTypeOf<ErrorDetail[] | undefined>();
  });
});
