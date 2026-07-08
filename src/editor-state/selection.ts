/**
 * Pure page-selection helpers. Selection is an ordered array of PageIds
 * (order = click order), with Set semantics enforced here.
 */

import type { PageId, PageRef } from '../pdf-core/types';

export function toggleInSelection(selection: readonly PageId[], id: PageId): PageId[] {
  return selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
}

/** Selects the contiguous run between anchor and target (both inclusive). */
export function rangeSelection(
  pages: readonly PageRef[],
  anchor: PageId | null,
  target: PageId,
): PageId[] {
  const anchorIndex = anchor ? pages.findIndex((p) => p.id === anchor) : -1;
  const targetIndex = pages.findIndex((p) => p.id === target);
  if (targetIndex === -1) return [];
  if (anchorIndex === -1) return [target];
  const [from, to] =
    anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return pages.slice(from, to + 1).map((p) => p.id);
}

/** Drops ids that no longer exist in the page list. */
export function pruneSelection(selection: readonly PageId[], pages: readonly PageRef[]): PageId[] {
  const existing = new Set(pages.map((p) => p.id));
  return selection.filter((id) => existing.has(id));
}

/** Selection ordered by document position (for exports and range labels). */
export function selectionInDocumentOrder(
  selection: readonly PageId[],
  pages: readonly PageRef[],
): PageId[] {
  const selected = new Set(selection);
  return pages.filter((p) => selected.has(p.id)).map((p) => p.id);
}
