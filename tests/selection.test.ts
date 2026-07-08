import { describe, expect, it } from 'vitest';
import { pagesFromSource } from '../src/pdf-core/page-plan';
import {
  pruneSelection,
  rangeSelection,
  selectionInDocumentOrder,
  toggleInSelection,
} from '../src/editor-state/selection';

function makeIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

const pages = pagesFromSource('src', 5, makeIds()); // id-1..id-5

describe('toggleInSelection', () => {
  it('adds and removes ids', () => {
    expect(toggleInSelection([], 'a')).toEqual(['a']);
    expect(toggleInSelection(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('rangeSelection', () => {
  it('selects the run between anchor and target in either direction', () => {
    expect(rangeSelection(pages, 'id-2', 'id-4')).toEqual(['id-2', 'id-3', 'id-4']);
    expect(rangeSelection(pages, 'id-4', 'id-2')).toEqual(['id-2', 'id-3', 'id-4']);
  });

  it('falls back to the target when there is no anchor', () => {
    expect(rangeSelection(pages, null, 'id-3')).toEqual(['id-3']);
    expect(rangeSelection(pages, 'gone', 'id-3')).toEqual(['id-3']);
  });

  it('returns empty when the target does not exist', () => {
    expect(rangeSelection(pages, 'id-1', 'nope')).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('drops ids of removed pages', () => {
    expect(pruneSelection(['id-1', 'ghost', 'id-5'], pages)).toEqual(['id-1', 'id-5']);
  });
});

describe('selectionInDocumentOrder', () => {
  it('reorders click-order selection into document order', () => {
    expect(selectionInDocumentOrder(['id-5', 'id-1', 'id-3'], pages)).toEqual([
      'id-1',
      'id-3',
      'id-5',
    ]);
  });
});
