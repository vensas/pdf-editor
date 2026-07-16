import { readFileSync } from 'node:fs';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// Served from https://pdf-editor.apps.vensas.de/ (custom domain at the
// root). Override with PUBLIC_BASE_PATH=/pdf-editor/ to build for a
// project-page host like vensas.github.io/pdf-editor/.
const basePath = process.env['PUBLIC_BASE_PATH'] ?? '/';

export default defineConfig(({ env }) => ({
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/main.tsx' },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
  html: {
    template: './src/index.html',
  },
  server: {
    base: env === 'production' ? basePath : '/',
  },
  output: {
    assetPrefix: env === 'production' ? basePath : '/',
    // pdf.js and pdf-lib are large; raise the warning ceiling a little but
    // keep it as a guard against accidental bundle growth.
    target: 'web',
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
}));
