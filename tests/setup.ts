// Shared vitest setup. jest-dom matchers are harmless in node-env tests and
// used by the jsdom component tests.
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Without vitest globals, testing-library cannot register its automatic
// cleanup hook itself — do it explicitly (no-op outside jsdom).
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
