import { ApiError } from './ApiError';
import type { ErrorCode } from '../types/Errors';

const API_PREFIX = '/api/v1';

/** Upload request timeout: model call 60s + 15s for upload and network (C-08). */
export const UPLOAD_TIMEOUT_MS = 75_000;
/** Timeout for every other request (F-01). */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH';
  /** A plain object is sent as JSON; FormData is sent as multipart (the browser sets the boundary). */
  body?: object | FormData;
  timeoutMs?: number;
  /** Backend codes that are an expected outcome and must not be logged (e.g. O-12). */
  quietCodes?: readonly ErrorCode[];
}

function logFailure(error: ApiError): void {
  // Only request_id, code and HTTP status may be logged (B-03).
  console.error('API request failed', { request_id: error.request_id, code: error.code, status: error.status });
}

/**
 * The only place that calls fetch. All failures are converted to ApiError; there is no automatic retry (DD-06).
 */
export async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { method, body, timeoutMs = DEFAULT_TIMEOUT_MS, quietCodes = [] } = options;
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

  try {
    let response: Response;
    let payload: unknown;
    let payloadOk = true;
    try {
      response = await fetch(`${API_PREFIX}${path}`, init);
      try {
        payload = await response.json();
      } catch {
        // The timer also covers reading the body: an abort here is a timeout, not a malformed body.
        if (timedOut) {
          throw ApiError.timeout();
        }
        payloadOk = false;
      }
    } catch {
      throw timedOut ? ApiError.timeout() : ApiError.network();
    }

    if (!response.ok) {
      throw payloadOk ? ApiError.fromBody(response.status, payload) : ApiError.unknown(response.status);
    }
    if (!payloadOk) {
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
