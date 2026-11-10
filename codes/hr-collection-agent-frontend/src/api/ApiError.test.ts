import { describe, expect, it } from 'vitest';
import { ApiError } from './ApiError';

describe('ApiError', () => {
  it('builds from a valid backend error body, keeping details', () => {
    const error = ApiError.fromBody(422, {
      code: 'validation_failed',
      message: '字段校验失败',
      request_id: 'req_1',
      details: [{ field: 'phone', reason: 'invalid_format' }],
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.message).toBe('字段校验失败');
    expect(error.request_id).toBe('req_1');
    expect(error.details).toEqual([{ field: 'phone', reason: 'invalid_format' }]);
    expect(error.isClientError).toBe(false);
  });

  it('keeps only field and reason from details', () => {
    const error = ApiError.fromBody(422, {
      code: 'validation_failed',
      message: 'm',
      request_id: 'r',
      details: [{ field: 'email', reason: 'too_long', value: 'leaked' }],
    });
    expect(error.details).toEqual([{ field: 'email', reason: 'too_long' }]);
  });

  it.each([
    ['null', null],
    ['string', 'oops'],
    ['missing code', { message: 'm', request_id: 'r' }],
    ['missing message', { code: 'internal_error', request_id: 'r' }],
    ['missing request_id', { code: 'internal_error', message: 'm' }],
    ['unknown code', { code: 'something_else', message: 'm', request_id: 'r' }],
  ])('falls back to unknown_error for a malformed body (%s)', (_name, body) => {
    const error = ApiError.fromBody(502, body);
    expect(error.code).toBe('unknown_error');
    expect(error.status).toBe(502);
    expect(error.isClientError).toBe(true);
    expect(error.request_id).toBeUndefined();
  });

  it('never exposes the raw malformed body', () => {
    const error = ApiError.fromBody(502, '<html>Bad Gateway 测试用户甲</html>');
    expect(error.message).not.toContain('Bad Gateway');
    expect(error.message).not.toContain('测试用户甲');
  });

  it('creates client_timeout and network_error with fixed messages', () => {
    const timeout = ApiError.timeout();
    expect(timeout.code).toBe('client_timeout');
    expect(timeout.status).toBeUndefined();
    expect(timeout.isClientError).toBe(true);
    expect(timeout.message).not.toBe('');
    const network = ApiError.network();
    expect(network.code).toBe('network_error');
    expect(network.message).not.toBe('');
    expect(network.message).not.toBe(timeout.message);
  });
});
