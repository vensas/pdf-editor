/**
 * Pure snapshot-based undo/redo. Snapshots are cheap: they share structure
 * with the current document (arrays of references, not copied bytes).
 */

import type { DocSnapshot } from './types';

export const HISTORY_LIMIT = 100;

export interface History {
  past: DocSnapshot[];
  future: DocSnapshot[];
}

/** Records `before` as an undo step and clears the redo stack. */
export function record(history: History, before: DocSnapshot): History {
  const past = [...history.past, before];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export function undo(
  history: History,
  current: DocSnapshot,
): { history: History; doc: DocSnapshot } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    doc: previous,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

export function redo(
  history: History,
  current: DocSnapshot,
): { history: History; doc: DocSnapshot } | null {
  const [next, ...rest] = history.future;
  if (!next) return null;
  return {
    doc: next,
    history: { past: [...history.past, current], future: rest },
  };
}
