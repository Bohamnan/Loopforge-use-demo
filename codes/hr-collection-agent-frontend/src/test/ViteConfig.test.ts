import { describe, expect, it } from 'vitest';
import config, { BACKEND_TARGET, PROXY_TIMEOUT_MS } from '../../vite.config';

describe('vite dev proxy', () => {
  const proxy = (config.server?.proxy ?? {}) as Record<string, Record<string, unknown>>;
  const api = proxy['/api'] ?? {};

  it('forwards /api to the backend on 127.0.0.1', () => {
    expect(api.target).toBe('http://127.0.0.1:8000');
    expect(BACKEND_TARGET).toBe('http://127.0.0.1:8000');
  });

  it('does not rewrite cookies so Set-Cookie is preserved', () => {
    expect(api).not.toHaveProperty('cookieDomainRewrite');
    expect(api).not.toHaveProperty('cookiePathRewrite');
  });

  it('keeps proxy timeouts at or above the 75s upload timeout', () => {
    expect(PROXY_TIMEOUT_MS).toBeGreaterThanOrEqual(75_000);
    expect(api.timeout).toBe(PROXY_TIMEOUT_MS);
    expect(api.proxyTimeout).toBe(PROXY_TIMEOUT_MS);
  });
});
