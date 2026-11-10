import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Backend target uses 127.0.0.1 (not localhost): on macOS recent Node resolves
// localhost to ::1 while the backend only listens on 127.0.0.1 (AGENTS.md, DL review).
export const BACKEND_TARGET = 'http://127.0.0.1:8000';

// Upload timeout is 75s (C-08); the proxy must never time out earlier.
export const PROXY_TIMEOUT_MS = 120_000;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Set-Cookie is forwarded untouched: no cookieDomainRewrite / cookiePathRewrite (C-06, O-01).
      '/api': {
        target: BACKEND_TARGET,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
