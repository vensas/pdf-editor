/**
 * App shell: header with branding and theme toggle, the workspace (the app
 * always shows a document — it boots into a fresh blank sheet), window-wide
 * file drop, toasts, and the busy overlay.
 */

import { useEffect, type JSX } from 'react';
import { ensureDocument } from './services/new-document';
import { openFiles } from './services/open-files';
import { BusyOverlay } from './ui/components/BusyOverlay';
import { Workspace } from './ui/components/Workspace';
import { useFileDrop } from './ui/hooks/useFileDrop';
import { THEME_LABELS, useTheme } from './ui/hooks/useTheme';
import { Icon } from './ui/icons';
import { ToastProvider, useToasts } from './ui/toast/Toasts';

declare const __APP_VERSION__: string;

export function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner(): JSX.Element {
  const { theme, cycleTheme } = useTheme();
  const toasts = useToasts();

  // Boot into a blank sheet so there is always something to work on.
  useEffect(() => {
    void ensureDocument().catch(() => {
      toasts.push('error', 'Could not create a blank document.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragging = useFileDrop((files) => {
    void openFiles(files).then((result) => {
      for (const failure of result.errors) {
        toasts.push('error', `${failure.name}: ${failure.message}`);
      }
      if (result.openedFiles > 0) {
        toasts.push(
          'success',
          `Opened ${result.openedFiles} document${result.openedFiles === 1 ? '' : 's'}.`,
        );
      }
    });
  });

  return (
    <div className="app">
      <header className="app-header">
        <a
          className="brand"
          href="https://www.vensas.de"
          rel="noopener"
          aria-label="vensas GmbH website"
        >
          <img
            className="logo logo-light"
            src="vensas_logo_light.svg"
            alt="vensas GmbH"
            height={24}
          />
          <img
            className="logo logo-dark"
            src="vensas_logo_dark.svg"
            alt="vensas GmbH"
            height={24}
          />
        </a>
        <h1 className="app-title">PDF Editor</h1>
        <span className="privacy-badge" title="All processing happens locally in your browser">
          <Icon name="lock" size={13} />
          100% local
        </span>
        <button
          type="button"
          className="theme-toggle"
          title="Switch between automatic, light, and dark theme"
          onClick={cycleTheme}
        >
          <Icon name="theme" size={15} />
          {THEME_LABELS[theme]}
        </button>
      </header>

      <main className="app-main">
        <Workspace />
      </main>

      <footer className="app-footer">
        <p className="muted small">
          PDF Editor v{__APP_VERSION__} · A{' '}
          <a href="https://www.vensas.de" rel="noopener">
            vensas GmbH
          </a>{' '}
          product ·{' '}
          <a href="https://www.vensas.de/imprint" rel="noopener">
            Imprint
          </a>{' '}
          · Open source · All processing happens locally via{' '}
          <a href="https://pdf-lib.js.org" rel="noopener">
            pdf-lib
          </a>{' '}
          and{' '}
          <a href="https://mozilla.github.io/pdf.js/" rel="noopener">
            pdf.js
          </a>{' '}
          ·{' '}
          <a href="https://github.com/vensas/pdf-editor" rel="noopener">
            Source on GitHub
          </a>
        </p>
      </footer>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <Icon name="upload" size={32} />
            <p>Drop PDFs to open them — each file becomes its own tab</p>
          </div>
        </div>
      )}

      <BusyOverlay />
    </div>
  );
}
