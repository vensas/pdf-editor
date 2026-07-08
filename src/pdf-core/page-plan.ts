/**
 * Pure operations on the working document's page list. Every function
 * returns a new array and never mutates its input, so the results can be
 * used directly as undo/redo history snapshots.
 */

import { addRotations } from './geometry';
import type { PageId, PageRef, Rotation, SourceId } from './types';

export interface MakeId {
  (): string;
}

const defaultMakeId: MakeId = () => crypto.randomUUID();

/** Builds fresh PageRefs for every page of a newly imported source. */
export function pagesFromSource(
  sourceId: SourceId,
  pageCount: number,
  makeId: MakeId = defaultMakeId,
): PageRef[] {
  return Array.from({ length: pageCount }, (_, sourceIndex) => ({
    id: makeId(),
    sourceId,
    sourceIndex,
    rotation: 0 as Rotation,
  }));
}

/**
 * Moves the given pages (keeping their relative order) so that they start at
 * `targetIndex`, expressed as an index into the list *without* the moved pages.
 */
export function movePages(
  pages: PageRef[],
  ids: readonly PageId[],
  targetIndex: number,
): PageRef[] {
  const idSet = new Set(ids);
  const moved = pages.filter((page) => idSet.has(page.id));
  if (moved.length === 0) return pages;
  const rest = pages.filter((page) => !idSet.has(page.id));
  const clamped = Math.max(0, Math.min(targetIndex, rest.length));
  return [...rest.slice(0, clamped), ...moved, ...rest.slice(clamped)];
}

export function rotatePages(
  pages: PageRef[],
  ids: readonly PageId[],
  delta: 90 | -90 | 180,
): PageRef[] {
  const idSet = new Set(ids);
  return pages.map((page) =>
    idSet.has(page.id) ? { ...page, rotation: addRotations(page.rotation, delta) } : page,
  );
}

export function removePages(pages: PageRef[], ids: readonly PageId[]): PageRef[] {
  const idSet = new Set(ids);
  return pages.filter((page) => !idSet.has(page.id));
}

/** Duplicates each given page, inserting the copy right after its original. */
export function duplicatePages(
  pages: PageRef[],
  ids: readonly PageId[],
  makeId: MakeId = defaultMakeId,
): { pages: PageRef[]; copies: Map<PageId, PageId> } {
  const idSet = new Set(ids);
  const result: PageRef[] = [];
  const copies = new Map<PageId, PageId>();
  for (const page of pages) {
    result.push(page);
    if (idSet.has(page.id)) {
      const copyId = makeId();
      copies.set(page.id, copyId);
      result.push({ ...page, id: copyId });
    }
  }
  return { pages: result, copies };
}

/** Inserts pages at the given index (clamped to the list bounds). */
export function insertPages(pages: PageRef[], toInsert: PageRef[], atIndex: number): PageRef[] {
  const clamped = Math.max(0, Math.min(atIndex, pages.length));
  return [...pages.slice(0, clamped), ...toInsert, ...pages.slice(clamped)];
}

/** Returns the ids of sources still referenced by at least one page. */
export function referencedSources(pages: readonly PageRef[]): Set<SourceId> {
  return new Set(pages.map((page) => page.sourceId));
}
