import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Browser storage is forbidden everywhere (F-02): resume content must never be persisted in the browser.
const STORAGE_NAMES = ['localStorage', 'sessionStorage', 'indexedDB'];
const GLOBAL_OBJECTS = ['window', 'globalThis', 'self', 'top', 'parent'];

const storageGlobals = STORAGE_NAMES.map((name) => ({
  name,
  message: 'Browser storage is forbidden (F-02): resume content must stay in runtime memory only.',
}));

const storageProperties = GLOBAL_OBJECTS.flatMap((object) =>
  STORAGE_NAMES.map((property) => ({
    object,
    property,
    message: 'Browser storage is forbidden (F-02): resume content must stay in runtime memory only.',
  })),
);

const EXIT_MESSAGE = 'Direct network access is forbidden here: all backend calls go through src/api (F-01).';
// Anything that can talk to the network must live in src/api.
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
const networkGlobals = NETWORK_GLOBALS.map((name) => ({ name, message: EXIT_MESSAGE }));
const networkProperties = [
  ...GLOBAL_OBJECTS.flatMap((object) => NETWORK_GLOBALS.map((property) => ({ object, property, message: EXIT_MESSAGE }))),
  { object: 'navigator', property: 'sendBeacon', message: EXIT_MESSAGE },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals],
      'no-restricted-properties': ['error', ...storageProperties],
      // Resume content and response bodies must never reach the console (B-03).
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    // Everything except src/api (and tests) must stay off the network: fetch, XHR, WebSocket, EventSource, sendBeacon.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/**', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals, ...networkGlobals],
      'no-restricted-properties': ['error', ...storageProperties, ...networkProperties],
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
