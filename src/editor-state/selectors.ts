/**
 * Pure derived views over the editor state — including the bridge from a
 * document's state to the export worker's AssembleInput.
 */

import { displayedSize, normalizeRotation } from '../pdf-core/geometry';
import type {
  Annotation,
  AssembleInput,
  PageId,
  PagePlanItem,
  PageRef,
  Rotation,
  SourceId,
  SourcePageInfo,
} from '../pdf-core/types';
import { selectionInDocumentOrder } from './selection';
import type { DocumentState, EditorSnapshot } from './types';

export interface PageDisplayInfo {
  /** Size of the page as displayed at scale 1, in PDF points. */
  width: number;
  height: number;
  /** Total displayed rotation: inherent + user delta. */
  totalRotation: Rotation;
}

/**
 * Pure computation from a source page's static info + the user rotation.
 * React components should select the (referentially stable) SourcePageInfo
 * from the store and call this in render — selecting the computed object
 * directly would return a fresh reference every time and loop
 * useSyncExternalStore.
 */
export function computeDisplayInfo(
  info: SourcePageInfo | undefined,
  userRotation: Rotation,
): PageDisplayInfo {
  const width = info?.width ?? 595; // A4 fallback, only hit for broken state
  const height = info?.height ?? 842;
  const totalRotation = normalizeRotation((info?.rotate ?? 0) + userRotation);
  return { ...displayedSize(width, height, totalRotation), totalRotation };
}

export function pageDisplayInfo(state: EditorSnapshot, page: PageRef): PageDisplayInfo {
  return computeDisplayInfo(
    state.sources[page.sourceId]?.pageInfos[page.sourceIndex],
    page.rotation,
  );
}

export function annotationsForPage(docState: DocumentState, pageId: PageId): Annotation[] {
  return Object.values(docState.doc.annotations).filter((a) => a.pageId === pageId);
}

/** Zero-based positions (in the document) of the selected pages. */
export function selectedPositions(docState: DocumentState): number[] {
  const selected = new Set(docState.selection);
  return docState.doc.pages.flatMap((page, index) => (selected.has(page.id) ? [index] : []));
}

/** All pages of the document, in order. */
export function allPageIds(docState: DocumentState): PageId[] {
  return docState.doc.pages.map((page) => page.id);
}

/** The selection in document order. */
export function selectedPageIds(docState: DocumentState): PageId[] {
  return selectionInDocumentOrder(docState.selection, docState.doc.pages);
}

/** Ids of the pages at the given zero-based document positions. */
export function pageIdsAtPositions(
  docState: DocumentState,
  positions: readonly number[],
): PageId[] {
  return positions.map((position) => {
    const page = docState.doc.pages[position];
    if (!page) throw new Error(`Page ${position + 1} does not exist.`);
    return page.id;
  });
}

/**
 * Builds the worker input for exporting the given pages of one document (in
 * the given order) as one output PDF. Only the sources and assets actually
 * referenced are included, so the worker never receives more bytes than
 * needed.
 */
export function buildAssembleInput(
  state: EditorSnapshot,
  docState: DocumentState,
  pageIds: readonly PageId[],
): AssembleInput {
  const byId = new Map(docState.doc.pages.map((page) => [page.id, page]));
  const pages: PagePlanItem[] = [];
  for (const id of pageIds) {
    const page = byId.get(id);
    if (!page) throw new Error('A selected page no longer exists.');
    pages.push({
      sourceId: page.sourceId,
      sourceIndex: page.sourceIndex,
      rotation: page.rotation,
      annotations: annotationsForPage(docState, id),
    });
  }

  const sources: AssembleInput['sources'] = {};
  const assets: AssembleInput['assets'] = {};
  for (const item of pages) {
    if (!sources[item.sourceId]) {
      const source = state.sources[item.sourceId];
      if (!source) throw new Error('A source document is missing.');
      sources[item.sourceId] = source.bytes;
    }
    for (const annotation of item.annotations) {
      if (annotation.kind === 'image' && !assets[annotation.assetId]) {
        const asset = state.assets[annotation.assetId];
        if (!asset) throw new Error('An annotation image is missing.');
        assets[annotation.assetId] = { mime: asset.mime, bytes: asset.bytes };
      }
    }
  }

  return { pages, sources, assets };
}

/**
 * True while a document is nothing but an untouched blank starter sheet —
 * the state in which a first import should replace the sheet instead of
 * appending to it.
 */
export function isPristineBlankDocument(state: EditorSnapshot, docState: DocumentState): boolean {
  const page = docState.doc.pages[0];
  return (
    docState.doc.pages.length === 1 &&
    Object.keys(docState.doc.annotations).length === 0 &&
    !docState.docNameClaimed &&
    page !== undefined &&
    state.sources[page.sourceId]?.origin === 'blank'
  );
}

/** Sources referenced by no open document (current docs or their histories). */
export function unreferencedSources(state: EditorSnapshot): SourceId[] {
  const referenced = new Set<SourceId>();
  for (const docState of Object.values(state.documents)) {
    for (const snapshot of [docState.doc, ...docState.past, ...docState.future]) {
      for (const page of snapshot.pages) referenced.add(page.sourceId);
    }
  }
  return Object.keys(state.sources).filter((id) => !referenced.has(id));
}
