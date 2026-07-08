/**
 * Light / dark / auto theme, persisted to localStorage and applied via
 * data-theme on <html> (a pre-paint inline script in index.html avoids the
 * flash on load). "Auto" removes the attribute and lets color-scheme follow
 * the OS.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'auto' | 'light' | 'dark';

const THEME_ORDER: Theme[] = ['auto', 'light', 'dark'];
export const THEME_LABELS: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('theme');
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'auto') {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = theme;
  }
}

export function useTheme(): { theme: Theme; cycleTheme: () => void } {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readTheme,
    () => 'auto' as Theme,
  );

  const cycleTheme = useCallback(() => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(readTheme()) + 1) % THEME_ORDER.length]!;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private-mode storage errors are fine; the theme just won't persist.
    }
    applyTheme(next);
    for (const listener of listeners) listener();
  }, []);

  return { theme, cycleTheme };
}
