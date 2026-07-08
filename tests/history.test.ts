import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, record, redo, undo } from '../src/editor-state/history';
import type { DocSnapshot } from '../src/editor-state/types';

const doc = (marker: number): DocSnapshot => ({
  pages: [{ id: `p-${marker}`, sourceId: 's', sourceIndex: 0, rotation: 0 }],
  annotations: {},
});

describe('history', () => {
  it('records steps and undoes/redoes them', () => {
    const v1 = doc(1);
    const v2 = doc(2);
    let history = record({ past: [], future: [] }, v1);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);

    const undone = undo(history, v2)!;
    expect(undone.doc).toBe(v1);
    expect(canRedo(undone.history)).toBe(true);

    const redone = redo(undone.history, undone.doc)!;
    expect(redone.doc).toBe(v2);
    history = redone.history;
    expect(canRedo(history)).toBe(false);
    expect(canUndo(history)).toBe(true);
  });

  it('returns null when there is nothing to undo or redo', () => {
    expect(undo({ past: [], future: [] }, doc(0))).toBeNull();
    expect(redo({ past: [], future: [] }, doc(0))).toBeNull();
  });

  it('clears the redo stack on a new record', () => {
    const history = record({ past: [doc(1)], future: [doc(3)] }, doc(2));
    expect(history.future).toEqual([]);
    expect(history.past).toHaveLength(2);
  });

  it('caps the undo depth', () => {
    let history = { past: [] as DocSnapshot[], future: [] as DocSnapshot[] };
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      history = record(history, doc(i));
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest entries were dropped.
    expect(history.past[0]!.pages[0]!.id).toBe('p-10');
  });
});
