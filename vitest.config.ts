import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core logic tests run in node; UI tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/pdf-core/**', 'src/editor-state/**', 'src/export/zip.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
