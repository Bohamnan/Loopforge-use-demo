// Mirror of OpenAPI 0.2.0 error schemas (see ResumeModel.ts for the maintenance rule).

/** ErrorCode: the 19 business codes returned by the backend. */
export const ERROR_CODES = [
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
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** ErrorDetail.reason values. */
export const ERROR_REASONS = ['required', 'invalid_format', 'invalid_type', 'too_long', 'unknown_field'] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

export interface ErrorDetail {
  /** Field name only, e.g. phone or work_experiences[0].start_date. Never contains the value. */
  field: string;
  reason: ErrorReason;
}

export interface ErrorResponse {
  code: ErrorCode;
  /** User-facing, non-sensitive message. The UI shows only this text. */
  message: string;
  request_id: string;
  details?: ErrorDetail[];
}

/** Frontend-only codes, deliberately kept out of the contract ErrorCode (F-05). */
export type ClientErrorCode = 'client_timeout' | 'network_error' | 'unknown_error';

/** Code carried by ApiError: a contract code or a frontend-only code. */
export type ApiErrorCode = ErrorCode | ClientErrorCode;
