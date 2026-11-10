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

const FETCH_MESSAGE = 'Direct fetch is forbidden here: all backend calls go through src/api.';
const fetchProperties = GLOBAL_OBJECTS.map((object) => ({
  object,
  property: 'fetch',
  message: FETCH_MESSAGE,
}));

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
    // Pages, components and hooks must not call fetch; src/api is the only exit (F-01 layering).
    files: ['src/pages/**', 'src/components/**', 'src/hooks/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...storageGlobals,
        { name: 'fetch', message: FETCH_MESSAGE },
      ],
      'no-restricted-properties': ['error', ...storageProperties, ...fetchProperties],
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
