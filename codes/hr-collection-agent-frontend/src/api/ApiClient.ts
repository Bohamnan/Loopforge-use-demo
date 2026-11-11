import { ApiError } from './ApiError';
import type { ErrorCode } from '../types/Errors';

const API_PREFIX = '/api/v1';

/** Upload request timeout: model call 60s + 15s for upload and network (C-08). */
export const UPLOAD_TIMEOUT_MS = 75_000;
/** Chat request timeout: one synchronous model call, same budget as upload (DD-12). */
export const CHAT_TIMEOUT_MS = 75_000;
/** Timeout for every other request (F-01). */
export const DEFAULT_TIMEOUT_MS = 30_000;

const BLOB_TYPES: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png'];

/** json = parse a JSON body (default); none = expect 204 without a body; blob = original file bytes. */
export type ResponseMode = 'json' | 'none' | 'blob';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** A plain object is sent as JSON; FormData is sent as multipart (the browser sets the boundary). */
  body?: object | FormData;
  timeoutMs?: number;
  /** Backend codes that are an expected outcome and must not be logged (e.g. DELETE session_not_found). */
  quietCodes?: readonly ErrorCode[];
  /** Shape check for a 2xx JSON body; a body that fails it is an unknown_error, never a success. */
  validate?: (payload: unknown) => boolean;
  responseMode?: ResponseMode;
}

function logFailure(error: ApiError): void {
  // Only request_id, code and HTTP status may be logged (B-03).
  console.error('API request failed', { request_id: error.request_id, code: error.code, status: error.status });
}

/**
 * The only place that calls fetch. All failures are converted to ApiError; there is no automatic retry (DD-06).
 * Error bodies are parsed as JSON in every response mode.
 */
export async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { method, body, timeoutMs = DEFAULT_TIMEOUT_MS, quietCodes = [], validate, responseMode = 'json' } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const init: RequestInit = { method, credentials: 'same-origin', signal: controller.signal };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  /** The timer also covers reading the body: an abort while reading is a timeout. */
  const failure = () => (timedOut ? ApiError.timeout() : ApiError.network());

  try {
    let response: Response;
    try {
      response = await fetch(`${API_PREFIX}${path}`, init);
    } catch {
      throw failure();
    }

    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw timedOut ? ApiError.timeout() : ApiError.unknown(response.status);
      }
      throw ApiError.fromBody(response.status, payload);
    }

    if (responseMode === 'none') {
      if (response.status !== 204) throw ApiError.unknown(response.status);
      return undefined as T;
    }
    if (responseMode === 'blob') {
      const type = (response.headers.get('Content-Type') ?? '').split(';')[0]?.trim() ?? '';
      if (!BLOB_TYPES.includes(type)) throw ApiError.unknown(response.status);
      try {
        return (await response.blob()) as T;
      } catch {
        throw failure();
      }
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw timedOut ? ApiError.timeout() : ApiError.unknown(response.status);
    }
    if (validate && !validate(payload)) {
      throw ApiError.unknown(response.status);
    }
    return payload as T;
  } catch (error) {
    const apiError = error instanceof ApiError ? error : ApiError.unknown();
    if (!quietCodes.includes(apiError.code as ErrorCode)) {
      logFailure(apiError);
    }
    throw apiError;
  } finally {
    clearTimeout(timer);
  }
}
