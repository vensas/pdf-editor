/**
 * The single zustand store behind the editor. Several documents (tabs) are
 * open at once; every page/annotation/selection/history action targets the
 * active document. All mutations are synchronous and built from the pure
 * helpers in pdf-core / history / selection / split, so the store stays thin
 * and every transition is unit-testable.
 *
 * Async orchestration (loading files, exporting) lives in src/services and
 * only ever talks to the store through these actions.
 */

import { create } from 'zustand';
import type { Annotation, AnnotationId, ImageAsset, PageId, SourceId } from '../pdf-core/types';
import {
  duplicatePages as duplicatePagesPure,
  insertPages,
  movePages,
  pagesFromSource,
  removePages,
  rotatePages as rotatePagesPure,
} from '../pdf-core/page-plan';
import { canRedo, canUndo, record, redo, undo } from './history';
import {
  pruneSelection,
  rangeSelection,
  selectionInDocumentOrder,
  toggleInSelection,
} from './selection';
import { splitDocumentState } from './split';
import { EMPTY_DOC } from './types';
import type {
  BusyState,
  DocSnapshot,
  DocumentId,
  DocumentState,
  EditorSnapshot,
  RecentDoc,
  SourceEntry,
  Tool,
} from './types';

const MAX_RECENTS = 5;

export interface CloseResult {
  /** Sources no open document references anymore — release their renderers. */
  releasedSources: SourceId[];
}

export interface EditorActions {
  createDocument(options?: { name?: string; activate?: boolean }): DocumentId;
  setActiveDocument(id: DocumentId): void;
  closeDocument(id: DocumentId): CloseResult;
  /** Splits the active document into new tabs, one per page group. */
  openSplitDocuments(groups: readonly (readonly number[])[]): DocumentId[];

  addSource(entry: SourceEntry, options?: { documentId?: DocumentId; insertAt?: number }): void;
  removeRecent(id: string): void;

  setTool(tool: Tool): void;
  setBusy(busy: BusyState | null): void;

  selectOnly(id: PageId): void;
  toggleSelect(id: PageId): void;
  rangeSelect(id: PageId): void;
  selectAll(): void;
  clearSelection(): void;
  setActivePage(id: PageId | null): void;

  reorderPages(ids: readonly PageId[], targetIndex: number): void;
  rotateSelectedPages(delta: 90 | -90): void;
  rotatePage(id: PageId, delta: 90 | -90): void;
  deletePages(ids: readonly PageId[]): void;
  duplicatePages(ids: readonly PageId[]): void;

  addAnnotation(annotation: Annotation, asset?: ImageAsset): void;
  updateAnnotation(
    id: AnnotationId,
    patch: Partial<Annotation>,
    options?: { transient?: boolean },
  ): void;
  deleteAnnotation(id: AnnotationId): void;
  setActiveAnnotation(id: AnnotationId | null): void;
  /** Records `before` as one undo step for a finished gesture (drag/resize). */
  commitSnapshot(before: DocSnapshot): void;

  undo(): void;
  redo(): void;
}

export type EditorStore = EditorSnapshot & EditorActions;

export const initialSnapshot: EditorSnapshot = {
  documents: {},
  documentOrder: [],
  activeDocumentId: null,
  sources: {},
  assets: {},
  tool: 'select',
  recents: [],
  busy: null,
};

export function emptyDocumentState(id: DocumentId, name: string): DocumentState {
  return {
    id,
    doc: EMPTY_DOC,
    past: [],
    future: [],
    selection: [],
    selectionAnchor: null,
    activePageId: null,
    activeAnnotationId: null,
    docName: name,
    docNameClaimed: false,
  };
}

export const useEditorStore = create<EditorStore>()((set, get) => {
  const activeDoc = (): DocumentState | undefined => {
    const state = get();
    return state.activeDocumentId ? state.documents[state.activeDocumentId] : undefined;
  };

  /** Merges a partial update into one document. */
  const patchDocument = (id: DocumentId, patch: Partial<DocumentState>): void => {
    set((state) => {
      const existing = state.documents[id];
      if (!existing) return state;
      return { documents: { ...state.documents, [id]: { ...existing, ...patch } } };
    });
  };

  const updateActive = (fn: (docState: DocumentState) => Partial<DocumentState>): void => {
    const docState = activeDoc();
    if (docState) patchDocument(docState.id, fn(docState));
  };

  /** A document change that records the previous snapshot as an undo step. */
  const applyDoc = (docState: DocumentState, next: DocSnapshot): Partial<DocumentState> => {
    const history = record({ past: docState.past, future: docState.future }, docState.doc);
    return {
      doc: next,
      past: history.past,
      future: history.future,
      selection: pruneSelection(docState.selection, next.pages),
      selectionAnchor:
        docState.selectionAnchor && next.pages.some((p) => p.id === docState.selectionAnchor)
          ? docState.selectionAnchor
          : null,
      activePageId: resolveActivePage(docState.activePageId, docState.doc, next),
      activeAnnotationId:
        docState.activeAnnotationId && next.annotations[docState.activeAnnotationId]
          ? docState.activeAnnotationId
          : null,
    };
  };

  const applyHistoryResult = (
    docState: DocumentState,
    result: { history: { past: DocSnapshot[]; future: DocSnapshot[] }; doc: DocSnapshot } | null,
  ): void => {
    if (!result) return;
    patchDocument(docState.id, {
      doc: result.doc,
      past: result.history.past,
      future: result.history.future,
      selection: pruneSelection(docState.selection, result.doc.pages),
      activePageId: resolveActivePage(docState.activePageId, docState.doc, result.doc),
      activeAnnotationId: null,
    });
  };

  return {
    ...initialSnapshot,

    createDocument(options) {
      const id = crypto.randomUUID();
      set((state) => {
        const name = options?.name ?? untitledName(state);
        return {
          documents: { ...state.documents, [id]: emptyDocumentState(id, name) },
          documentOrder: [...state.documentOrder, id],
          activeDocumentId: options?.activate === false ? state.activeDocumentId : id,
        };
      });
      return id;
    },

    setActiveDocument(id) {
      if (get().documents[id]) set({ activeDocumentId: id, tool: 'select' });
    },

    closeDocument(id) {
      const state = get();
      const closing = state.documents[id];
      if (!closing) return { releasedSources: [] };

      const documents = { ...state.documents };
      delete documents[id];
      const documentOrder = state.documentOrder.filter((docId) => docId !== id);

      // Sources still needed by any remaining document (including their
      // undo/redo histories) must survive; the rest are released.
      const stillReferenced = new Set<SourceId>();
      for (const remaining of Object.values(documents)) {
        for (const snapshot of [remaining.doc, ...remaining.past, ...remaining.future]) {
          for (const page of snapshot.pages) stillReferenced.add(page.sourceId);
        }
      }

      const sources: Record<SourceId, SourceEntry> = {};
      const released: SourceId[] = [];
      const closedAt = Date.now();
      const newRecents: RecentDoc[] = [];
      for (const source of Object.values(state.sources)) {
        if (stillReferenced.has(source.id)) {
          sources[source.id] = source;
          continue;
        }
        released.push(source.id);
        // Editor-created blank sheets are not worth "reopening" — skip them.
        if (source.origin !== 'blank') {
          newRecents.push({
            id: source.id,
            name: source.name,
            pageCount: source.pageCount,
            bytes: source.bytes,
            closedAt,
          });
        }
      }

      // Newest first, dedupe by content identity (name + size), cap the list.
      const recents = [...newRecents, ...state.recents]
        .filter(
          (recent, index, all) =>
            all.findIndex(
              (other) => other.name === recent.name && other.bytes.length === recent.bytes.length,
            ) === index,
        )
        .slice(0, MAX_RECENTS);

      const closingIndex = state.documentOrder.indexOf(id);
      const activeDocumentId =
        state.activeDocumentId === id
          ? (documentOrder[Math.min(Math.max(closingIndex, 0), documentOrder.length - 1)] ?? null)
          : state.activeDocumentId;

      set({ documents, documentOrder, activeDocumentId, sources, recents, tool: 'select' });
      return { releasedSources: released };
    },

    openSplitDocuments(groups) {
      const docState = activeDoc();
      if (!docState || groups.length === 0) return [];
      const newDocs = splitDocumentState(docState, groups);
      set((state) => ({
        documents: {
          ...state.documents,
          ...Object.fromEntries(newDocs.map((doc) => [doc.id, doc])),
        },
        documentOrder: [...state.documentOrder, ...newDocs.map((doc) => doc.id)],
        activeDocumentId: newDocs[0]?.id ?? state.activeDocumentId,
      }));
      return newDocs.map((doc) => doc.id);
    },

    addSource(entry, options) {
      let state = get();
      let targetId = options?.documentId ?? state.activeDocumentId;
      if (!targetId || !state.documents[targetId]) {
        // Robustness for services/tests: adding a source always lands somewhere.
        targetId = crypto.randomUUID();
        set((current) => ({
          documents: {
            ...current.documents,
            [targetId!]: emptyDocumentState(targetId!, untitledName(current)),
          },
          documentOrder: [...current.documentOrder, targetId!],
          activeDocumentId: targetId,
        }));
        state = get();
      }
      const docState = state.documents[targetId]!;

      const newPages = pagesFromSource(entry.id, entry.pageCount);
      const at = options?.insertAt ?? docState.doc.pages.length;
      const next = { ...docState.doc, pages: insertPages(docState.doc.pages, newPages, at) };
      // The first real file names the document; blank sheets never do.
      const claims = entry.origin !== 'blank' && !docState.docNameClaimed;
      patchDocument(targetId, {
        ...applyDoc(docState, next),
        docName: claims ? entry.name.replace(/\.pdf$/i, '') || docState.docName : docState.docName,
        docNameClaimed: docState.docNameClaimed || claims,
        activePageId: docState.activePageId ?? newPages[0]?.id ?? null,
      });
      set((current) => ({ sources: { ...current.sources, [entry.id]: entry } }));
    },

    removeRecent(id) {
      set((state) => ({ recents: state.recents.filter((recent) => recent.id !== id) }));
    },

    setTool(tool) {
      set({ tool });
      updateActive(() => ({ activeAnnotationId: null }));
    },

    setBusy(busy) {
      set({ busy });
    },

    selectOnly(id) {
      updateActive(() => ({ selection: [id], selectionAnchor: id, activePageId: id }));
    },

    toggleSelect(id) {
      updateActive((docState) => ({
        selection: toggleInSelection(docState.selection, id),
        selectionAnchor: id,
        activePageId: id,
      }));
    },

    rangeSelect(id) {
      updateActive((docState) => ({
        selection: rangeSelection(docState.doc.pages, docState.selectionAnchor, id),
        activePageId: id,
      }));
    },

    selectAll() {
      updateActive((docState) => {
        const all = docState.doc.pages.map((page) => page.id);
        return { selection: docState.selection.length === all.length ? [] : all };
      });
    },

    clearSelection() {
      updateActive(() => ({ selection: [], selectionAnchor: null }));
    },

    setActivePage(id) {
      updateActive(() => ({ activePageId: id, activeAnnotationId: null }));
    },

    reorderPages(ids, targetIndex) {
      updateActive((docState) => {
        const next = movePages(docState.doc.pages, ids, targetIndex);
        if (samePageOrder(docState.doc.pages, next)) return {};
        return applyDoc(docState, { ...docState.doc, pages: next });
      });
    },

    rotateSelectedPages(delta) {
      updateActive((docState) => {
        const ids =
          docState.selection.length > 0
            ? docState.selection
            : docState.activePageId
              ? [docState.activePageId]
              : [];
        if (ids.length === 0) return {};
        return applyDoc(docState, {
          ...docState.doc,
          pages: rotatePagesPure(docState.doc.pages, ids, delta),
        });
      });
    },

    rotatePage(id, delta) {
      updateActive((docState) =>
        applyDoc(docState, {
          ...docState.doc,
          pages: rotatePagesPure(docState.doc.pages, [id], delta),
        }),
      );
    },

    deletePages(ids) {
      updateActive((docState) => {
        if (ids.length === 0 || ids.length >= docState.doc.pages.length) return {};
        const pages = removePages(docState.doc.pages, ids);
        const removed = new Set(ids);
        const annotations = Object.fromEntries(
          Object.entries(docState.doc.annotations).filter(([, a]) => !removed.has(a.pageId)),
        );
        return applyDoc(docState, { pages, annotations });
      });
    },

    duplicatePages(ids) {
      updateActive((docState) => {
        const ordered = selectionInDocumentOrder(ids, docState.doc.pages);
        if (ordered.length === 0) return {};
        const { pages } = duplicatePagesPure(docState.doc.pages, ordered);
        return applyDoc(docState, { ...docState.doc, pages });
      });
    },

    addAnnotation(annotation, asset) {
      updateActive((docState) => ({
        ...applyDoc(docState, {
          ...docState.doc,
          annotations: { ...docState.doc.annotations, [annotation.id]: annotation },
        }),
        activeAnnotationId: annotation.id,
      }));
      set((current) => ({
        tool: 'select',
        assets: asset ? { ...current.assets, [asset.id]: asset } : current.assets,
      }));
    },

    updateAnnotation(id, patch, options) {
      updateActive((docState) => {
        const existing = docState.doc.annotations[id];
        if (!existing) return {};
        const next = {
          ...docState.doc,
          annotations: {
            ...docState.doc.annotations,
            [id]: { ...existing, ...patch } as Annotation,
          },
        };
        return options?.transient ? { doc: next } : applyDoc(docState, next);
      });
    },

    deleteAnnotation(id) {
      updateActive((docState) => {
        if (!docState.doc.annotations[id]) return {};
        const annotations = { ...docState.doc.annotations };
        delete annotations[id];
        return applyDoc(docState, { ...docState.doc, annotations });
      });
    },

    setActiveAnnotation(id) {
      updateActive(() => ({ activeAnnotationId: id }));
    },

    commitSnapshot(before) {
      updateActive((docState) => {
        if (before === docState.doc) return {};
        const history = record({ past: docState.past, future: docState.future }, before);
        return { past: history.past, future: history.future };
      });
    },

    undo() {
      const docState = activeDoc();
      if (!docState) return;
      applyHistoryResult(
        docState,
        undo({ past: docState.past, future: docState.future }, docState.doc),
      );
    },

    redo() {
      const docState = activeDoc();
      if (!docState) return;
      applyHistoryResult(
        docState,
        redo({ past: docState.past, future: docState.future }, docState.doc),
      );
    },
  };
});

// --- Selectors over the active document ---------------------------------------

export function selectActiveDocument(state: EditorSnapshot): DocumentState | undefined {
  return state.activeDocumentId ? state.documents[state.activeDocumentId] : undefined;
}

export function selectCanUndo(state: EditorStore): boolean {
  const docState = selectActiveDocument(state);
  return docState ? canUndo({ past: docState.past, future: docState.future }) : false;
}

export function selectCanRedo(state: EditorStore): boolean {
  const docState = selectActiveDocument(state);
  return docState ? canRedo({ past: docState.past, future: docState.future }) : false;
}

// --- Pure helpers ---------------------------------------------------------------

function untitledName(state: EditorSnapshot): string {
  const taken = new Set(Object.values(state.documents).map((doc) => doc.docName));
  if (!taken.has('Untitled')) return 'Untitled';
  let counter = 2;
  while (taken.has(`Untitled ${counter}`)) counter += 1;
  return `Untitled ${counter}`;
}

function samePageOrder(a: readonly { id: string }[], b: readonly { id: string }[]): boolean {
  return a.length === b.length && a.every((page, index) => page.id === b[index]?.id);
}

/**
 * Keeps the active page stable across document changes; when it disappears,
 * falls back to the page now occupying the same position.
 */
function resolveActivePage(
  activeId: PageId | null,
  before: DocSnapshot,
  after: DocSnapshot,
): PageId | null {
  if (after.pages.length === 0) return null;
  if (activeId && after.pages.some((page) => page.id === activeId)) return activeId;
  const oldIndex = activeId ? before.pages.findIndex((page) => page.id === activeId) : -1;
  const fallback = after.pages[Math.min(Math.max(oldIndex, 0), after.pages.length - 1)];
  return fallback?.id ?? null;
}
