import { describe, expect, it } from 'vitest';
import {
  duplicatePages,
  insertPages,
  movePages,
  pagesFromSource,
  referencedSources,
  removePages,
  rotatePages,
} from '../src/pdf-core/page-plan';
import type { PageRef } from '../src/pdf-core/types';

function makeIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function pages(count: number, sourceId = 'src'): PageRef[] {
  return pagesFromSource(sourceId, count, makeIds());
}

const ids = (list: PageRef[]): string[] => list.map((page) => page.id);

describe('pagesFromSource', () => {
  it('creates one ref per source page with zero rotation', () => {
    const result = pages(3);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.sourceIndex)).toEqual([0, 1, 2]);
    expect(result.every((p) => p.rotation === 0)).toBe(true);
    expect(new Set(ids(result)).size).toBe(3);
  });
});

describe('movePages', () => {
  it('moves a single page to the target position', () => {
    const list = pages(4); // id-1..id-4
    expect(ids(movePages(list, ['id-4'], 0))).toEqual(['id-4', 'id-1', 'id-2', 'id-3']);
  });

  it('moves multiple pages keeping their relative order', () => {
    const list = pages(5);
    expect(ids(movePages(list, ['id-1', 'id-3'], 3))).toEqual([
      'id-2',
      'id-4',
      'id-5',
      'id-1',
      'id-3',
    ]);
  });

  it('clamps out-of-range targets', () => {
    const list = pages(3);
    expect(ids(movePages(list, ['id-1'], 99))).toEqual(['id-2', 'id-3', 'id-1']);
    expect(ids(movePages(list, ['id-3'], -5))).toEqual(['id-3', 'id-1', 'id-2']);
  });

  it('returns the input unchanged when no ids match', () => {
    const list = pages(3);
    expect(movePages(list, ['nope'], 0)).toBe(list);
  });
});

describe('rotatePages', () => {
  it('rotates only the given pages, wrapping around', () => {
    const list = pages(2);
    const once = rotatePages(list, ['id-1'], 90);
    expect(once[0]!.rotation).toBe(90);
    expect(once[1]!.rotation).toBe(0);
    const back = rotatePages(once, ['id-1'], -90);
    expect(back[0]!.rotation).toBe(0);
  });

  it('wraps 270 + 90 to 0 and 0 - 90 to 270', () => {
    let list = pages(1);
    for (let i = 0; i < 4; i++) list = rotatePages(list, ['id-1'], 90);
    expect(list[0]!.rotation).toBe(0);
    expect(rotatePages(list, ['id-1'], -90)[0]!.rotation).toBe(270);
  });

  it('does not mutate the input', () => {
    const list = pages(1);
    rotatePages(list, ['id-1'], 90);
    expect(list[0]!.rotation).toBe(0);
  });
});

describe('removePages', () => {
  it('removes the given pages', () => {
    expect(ids(removePages(pages(3), ['id-2']))).toEqual(['id-1', 'id-3']);
  });
});

describe('duplicatePages', () => {
  it('inserts copies right after their originals with fresh ids', () => {
    const makeId = makeIds();
    const list = pagesFromSource('src', 3, makeId); // id-1..3
    const { pages: result, copies } = duplicatePages(list, ['id-1', 'id-3'], makeId);
    expect(ids(result)).toEqual(['id-1', 'id-4', 'id-2', 'id-3', 'id-5']);
    expect(copies.get('id-1')).toBe('id-4');
    expect(result[1]!.sourceIndex).toBe(0);
    expect(result[1]!.sourceId).toBe('src');
  });

  it('copies rotation state', () => {
    const makeId = makeIds();
    const rotated = rotatePages(pagesFromSource('src', 1, makeId), ['id-1'], 90);
    const { pages: result } = duplicatePages(rotated, ['id-1'], makeId);
    expect(result[1]!.rotation).toBe(90);
  });
});

describe('insertPages', () => {
  it('inserts at the given index, clamped', () => {
    const list = pages(2);
    const extra = pagesFromSource('other', 1, () => 'x-1');
    expect(ids(insertPages(list, extra, 1))).toEqual(['id-1', 'x-1', 'id-2']);
    expect(ids(insertPages(list, extra, 99))).toEqual(['id-1', 'id-2', 'x-1']);
  });
});

describe('referencedSources', () => {
  it('collects distinct source ids', () => {
    const list = [...pages(2, 'a'), ...pagesFromSource('b', 1, () => 'b-1')];
    expect(referencedSources(list)).toEqual(new Set(['a', 'b']));
  });
});
