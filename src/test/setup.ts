import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// fake-indexeddb gives every test file an in-memory `indexedDB` global.
// Only relevant in jsdom test files; a no-op under the default node environment.
afterEach(() => {
  cleanup();
});
