import {
  ERROR_CODES,
  ERROR_REASONS,
  type ApiErrorCode,
  type ClientErrorCode,
  type ErrorCode,
  type ErrorDetail,
  type ErrorReason,
} from '../types/Errors';

const CLIENT_ERROR_CODES: readonly ApiErrorCode[] = ['client_timeout', 'network_error', 'unknown_error'] satisfies ClientErrorCode[];

// Fixed texts for frontend-only codes. Backend codes always show the backend `message` (DD-09).
const CLIENT_MESSAGES: Record<ClientErrorCode, string> = {
  client_timeout: '请求超时，请重试。',
  network_error: '网络异常，请检查网络后重试。',
  unknown_error: '服务暂时不可用，请稍后重试。',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

function isErrorReason(value: unknown): value is ErrorReason {
  return typeof value === 'string' && (ERROR_REASONS as readonly string[]).includes(value);
}

/** Only `field` and `reason` are kept; anything else (e.g. echoed values) is dropped (B-03). */
function parseDetails(value: unknown): ErrorDetail[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const details: ErrorDetail[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.field === 'string' && isErrorReason(item.reason)) {
      details.push({ field: item.field, reason: item.reason });
    }
  }
  return details;
}

/** The single error type the UI sees. `message` is always safe to show to the user. */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: ApiErrorCode;
  readonly request_id: string | undefined;
  readonly details: ErrorDetail[] | undefined;

  constructor(init: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    request_id?: string;
    details?: ErrorDetail[];
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.request_id = init.request_id;
    this.details = init.details;
  }

  /** True for frontend-only codes (client_timeout / network_error / unknown_error). */
  get isClientError(): boolean {
    return CLIENT_ERROR_CODES.includes(this.code);
  }

  /**
   * Builds an ApiError from a parsed response body of a failed HTTP response.
   * A body that is not the contract ErrorResponse becomes unknown_error and is never shown (DD-10).
   */
  static fromBody(status: number, body: unknown): ApiError {
    if (
      isRecord(body) &&
      isErrorCode(body.code) &&
      typeof body.message === 'string' &&
      typeof body.request_id === 'string'
    ) {
      return new ApiError({
        code: body.code,
        message: body.message,
        status,
        request_id: body.request_id,
        details: parseDetails(body.details),
      });
    }
    return ApiError.unknown(status);
  }

  static unknown(status?: number): ApiError {
    return new ApiError({ code: 'unknown_error', message: CLIENT_MESSAGES.unknown_error, status });
  }

  static timeout(): ApiError {
    return new ApiError({ code: 'client_timeout', message: CLIENT_MESSAGES.client_timeout });
  }

  static network(): ApiError {
    return new ApiError({ code: 'network_error', message: CLIENT_MESSAGES.network_error });
  }
}
