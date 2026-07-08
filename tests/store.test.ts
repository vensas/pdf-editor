import { beforeEach, describe, expect, it } from 'vitest';
import type { Annotation } from '../src/pdf-core/types';
import { initialSnapshot, selectActiveDocument, useEditorStore } from '../src/editor-state/store';
import type { DocumentState, SourceEntry } from '../src/editor-state/types';

function makeSource(id: string, pageCount: number, name = `${id}.pdf`): SourceEntry {
  return {
    id,
    name,
    bytes: new Uint8Array([1, 2, 3]),
    pageCount,
    pageInfos: Array.from({ length: pageCount }, () => ({
      width: 600,
      height: 800,
      rotate: 0 as const,
    })),
  };
}

function annotation(pageId: string, id = 'a1'): Annotation {
  return {
    kind: 'highlight',
    id,
    pageId,
    rect: { x: 0, y: 0, width: 10, height: 10 },
    color: '#ffd43b',
    opacity: 0.5,
  };
}

const store = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState();

/** The active document; every page/annotation action targets it. */
function active(): DocumentState {
  const docState = selectActiveDocument(store());
  if (!docState) throw new Error('no active document');
  return docState;
}

beforeEach(() => {
  useEditorStore.setState({ ...initialSnapshot, recents: [] });
});

describe('documents', () => {
  it('creates and activates documents with unique untitled names', () => {
    const first = store().createDocument();
    expect(store().activeDocumentId).toBe(first);
    expect(active().docName).toBe('Untitled');

    const second = store().createDocument();
    expect(store().activeDocumentId).toBe(second);
    expect(active().docName).toBe('Untitled 2');
    expect(store().documentOrder).toEqual([first, second]);

    store().setActiveDocument(first);
    expect(store().activeDocumentId).toBe(first);
  });

  it('keeps per-document state independent', () => {
    const first = store().createDocument();
    store().addSource(makeSource('a', 2));
    const firstPages = active().doc.pages.map((page) => page.id);

    store().createDocument();
    store().addSource(makeSource('b', 3));
    expect(active().doc.pages).toHaveLength(3);

    store().setActiveDocument(first);
    expect(active().doc.pages.map((page) => page.id)).toEqual(firstPages);

    // Undo in one document must not touch the other.
    store().undo();
    expect(active().doc.pages).toHaveLength(0);
    const secondId = store().documentOrder[1]!;
    expect(store().documents[secondId]!.doc.pages).toHaveLength(3);
  });

  it('closing a document moves its file sources to recents and activates a neighbor', () => {
    const first = store().createDocument();
    store().addSource(makeSource('a', 2, 'a.pdf'));
    const second = store().createDocument();
    store().addSource(makeSource('b', 1, 'b.pdf'));

    const result = store().closeDocument(second);
    expect(result.releasedSources).toEqual(['b']);
    expect(store().activeDocumentId).toBe(first);
    expect(store().recents.map((recent) => recent.name)).toEqual(['b.pdf']);
    expect(store().sources['b']).toBeUndefined();
    expect(store().sources['a']).toBeDefined();
  });

  it('closing keeps sources alive that other documents still reference', () => {
    store().createDocument();
    store().addSource(makeSource('a', 4, 'a.pdf'));
    const [ids] = [store().openSplitDocuments([[0, 1]])];
    expect(ids).toHaveLength(1);

    // Close the original: source 'a' is still used by the split document.
    const original = store().documentOrder[0]!;
    const result = store().closeDocument(original);
    expect(result.releasedSources).toEqual([]);
    expect(store().sources['a']).toBeDefined();
    expect(store().recents).toHaveLength(0);

    // Closing the split document too releases the source into recents.
    const remaining = store().documentOrder[0]!;
    const final = store().closeDocument(remaining);
    expect(final.releasedSources).toEqual(['a']);
    expect(store().recents.map((recent) => recent.name)).toEqual(['a.pdf']);
  });

  it('keeps editor-created blank sheets out of recents when closing', () => {
    store().createDocument();
    store().addSource({ ...makeSource('blank', 1, 'Blank page.pdf'), origin: 'blank' });
    store().addSource(makeSource('a', 2, 'real.pdf'));
    store().closeDocument(store().activeDocumentId!);
    expect(store().recents.map((recent) => recent.name)).toEqual(['real.pdf']);
  });

  it('dedupes recents by name and size, capped at five', () => {
    store().createDocument();
    store().addSource(makeSource('a', 2, 'a.pdf'));
    store().closeDocument(store().activeDocumentId!);
    store().createDocument();
    store().addSource(makeSource('a2', 2, 'a.pdf'));
    store().closeDocument(store().activeDocumentId!);
    expect(store().recents.filter((recent) => recent.name === 'a.pdf')).toHaveLength(1);
  });
});

describe('openSplitDocuments', () => {
  it('creates one tab per group with copied pages and annotations', () => {
    store().createDocument();
    store().addSource(makeSource('a', 4, 'Report.pdf'));
    const originalPages = active().doc.pages;
    store().rotatePage(originalPages[2]!.id, 90);
    store().addAnnotation(annotation(originalPages[0]!.id));

    const created = store().openSplitDocuments([
      [0, 2],
      [3, 3],
    ]);
    expect(created).toHaveLength(2);
    expect(store().activeDocumentId).toBe(created[0]);

    const first = store().documents[created[0]!]!;
    expect(first.docName).toBe('Report_pages_1_3');
    expect(first.doc.pages.map((page) => page.sourceIndex)).toEqual([0, 2]);
    expect(first.doc.pages[1]!.rotation).toBe(90);
    // Page ids are fresh, annotations copied and re-bound.
    expect(first.doc.pages[0]!.id).not.toBe(originalPages[0]!.id);
    const copied = Object.values(first.doc.annotations);
    expect(copied).toHaveLength(1);
    expect(copied[0]!.pageId).toBe(first.doc.pages[0]!.id);
    expect(copied[0]!.id).not.toBe('a1');

    const second = store().documents[created[1]!]!;
    expect(second.docName).toBe('Report_pages_4_4');
    expect(second.doc.pages.map((page) => page.sourceIndex)).toEqual([3, 3]);

    // The original document is untouched.
    const originalId = store().documentOrder[0]!;
    expect(store().documents[originalId]!.doc.pages).toHaveLength(4);
  });
});

describe('addSource', () => {
  it('creates a document on demand and names it after the first file', () => {
    store().addSource(makeSource('a', 3, 'Report Q3.pdf'));
    expect(store().documentOrder).toHaveLength(1);
    expect(active().doc.pages).toHaveLength(3);
    expect(active().docName).toBe('Report Q3');
    expect(active().activePageId).toBe(active().doc.pages[0]!.id);

    store().addSource(makeSource('b', 2));
    expect(active().doc.pages).toHaveLength(5);
    expect(active().docName).toBe('Report Q3'); // unchanged

    store().undo();
    expect(active().doc.pages).toHaveLength(3);
    store().redo();
    expect(active().doc.pages).toHaveLength(5);
  });

  it('inserts at a position when requested', () => {
    store().addSource(makeSource('a', 2));
    const [first, second] = active().doc.pages.map((page) => page.id);
    store().addSource(makeSource('b', 1), { insertAt: 1 });
    const pages = active().doc.pages;
    expect(pages).toHaveLength(3);
    expect(pages[0]!.id).toBe(first);
    expect(pages[1]!.sourceId).toBe('b');
    expect(pages[2]!.id).toBe(second);
  });

  it('blank sources never claim the document name; the first real file does', () => {
    store().addSource({ ...makeSource('blank', 1, 'Blank page.pdf'), origin: 'blank' });
    expect(active().docName).toBe('Untitled');
    expect(active().docNameClaimed).toBe(false);

    store().addSource({ ...makeSource('a', 2, 'Report.pdf'), origin: 'file' });
    expect(active().docName).toBe('Report');
    expect(active().docNameClaimed).toBe(true);

    store().addSource(makeSource('b', 1, 'Other.pdf'));
    expect(active().docName).toBe('Report'); // first claim wins
  });
});

describe('page operations', () => {
  it('reorders pages and records history', () => {
    store().addSource(makeSource('a', 3));
    const [p1, p2, p3] = active().doc.pages.map((page) => page.id);
    store().reorderPages([p3!], 0);
    expect(active().doc.pages.map((page) => page.id)).toEqual([p3, p1, p2]);
    store().undo();
    expect(active().doc.pages.map((page) => page.id)).toEqual([p1, p2, p3]);
  });

  it('ignores no-op reorders (no history entry)', () => {
    store().addSource(makeSource('a', 2));
    const pastLength = active().past.length;
    const [p1] = active().doc.pages.map((page) => page.id);
    store().reorderPages([p1!], 0);
    expect(active().past).toHaveLength(pastLength);
  });

  it('rotates the selection', () => {
    store().addSource(makeSource('a', 2));
    const [p1] = active().doc.pages.map((page) => page.id);
    store().selectOnly(p1!);
    store().rotateSelectedPages(90);
    expect(active().doc.pages[0]!.rotation).toBe(90);
    expect(active().doc.pages[1]!.rotation).toBe(0);
  });

  it('deletes pages together with their annotations and prunes selection', () => {
    store().addSource(makeSource('a', 3));
    const [p1] = active().doc.pages.map((page) => page.id);
    store().addAnnotation(annotation(p1!));
    store().selectOnly(p1!);
    store().deletePages([p1!]);
    expect(active().doc.pages).toHaveLength(2);
    expect(Object.keys(active().doc.annotations)).toHaveLength(0);
    expect(active().selection).toEqual([]);
    // active page falls back to the page now at the same position
    expect(active().activePageId).toBe(active().doc.pages[0]!.id);
  });

  it('refuses to delete every page', () => {
    store().addSource(makeSource('a', 2));
    const ids = active().doc.pages.map((page) => page.id);
    store().deletePages(ids);
    expect(active().doc.pages).toHaveLength(2);
  });

  it('duplicates selected pages in document order', () => {
    store().addSource(makeSource('a', 2));
    const [p1, p2] = active().doc.pages.map((page) => page.id);
    store().duplicatePages([p2!, p1!]);
    const pages = active().doc.pages;
    expect(pages).toHaveLength(4);
    expect(pages[0]!.id).toBe(p1);
    expect(pages[1]!.sourceIndex).toBe(0); // copy of p1
    expect(pages[2]!.id).toBe(p2);
    expect(pages[3]!.sourceIndex).toBe(1); // copy of p2
  });
});

describe('annotations', () => {
  it('adds, updates, deletes with history', () => {
    store().addSource(makeSource('a', 1));
    const pageId = active().doc.pages[0]!.id;
    store().addAnnotation(annotation(pageId));
    expect(active().activeAnnotationId).toBe('a1');
    expect(store().tool).toBe('select');

    store().updateAnnotation('a1', { color: '#000000' });
    expect((active().doc.annotations['a1'] as { color: string }).color).toBe('#000000');

    store().undo();
    expect((active().doc.annotations['a1'] as { color: string }).color).toBe('#ffd43b');

    store().deleteAnnotation('a1');
    expect(active().doc.annotations['a1']).toBeUndefined();
    store().undo();
    expect(active().doc.annotations['a1']).toBeDefined();
  });

  it('transient updates coalesce into one undo step via commitSnapshot', () => {
    store().addSource(makeSource('a', 1));
    const pageId = active().doc.pages[0]!.id;
    store().addAnnotation(annotation(pageId));
    const before = active().doc;

    store().updateAnnotation(
      'a1',
      { rect: { x: 5, y: 5, width: 10, height: 10 } },
      { transient: true },
    );
    store().updateAnnotation(
      'a1',
      { rect: { x: 9, y: 9, width: 10, height: 10 } },
      { transient: true },
    );
    store().commitSnapshot(before);

    expect(active().doc.annotations['a1']!.rect.x).toBe(9);
    store().undo();
    expect(active().doc.annotations['a1']!.rect.x).toBe(0);
  });
});

describe('selection', () => {
  it('supports toggle, range, select-all, and clear', () => {
    store().addSource(makeSource('a', 4));
    const [p1, p2, p3, p4] = active().doc.pages.map((page) => page.id);
    store().selectOnly(p1!);
    store().toggleSelect(p3!);
    expect(active().selection).toEqual([p1, p3]);

    store().selectOnly(p2!);
    store().rangeSelect(p4!);
    expect(active().selection).toEqual([p2, p3, p4]);

    store().selectAll();
    expect(active().selection).toHaveLength(4);
    store().selectAll(); // toggles off when everything is selected
    expect(active().selection).toHaveLength(0);
  });
});
