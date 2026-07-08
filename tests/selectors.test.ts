import { beforeEach, describe, expect, it } from 'vitest';
import type { Annotation } from '../src/pdf-core/types';
import {
  allPageIds,
  buildAssembleInput,
  isPristineBlankDocument,
  pageDisplayInfo,
  pageIdsAtPositions,
  selectedPageIds,
  selectedPositions,
} from '../src/editor-state/selectors';
import { initialSnapshot, selectActiveDocument, useEditorStore } from '../src/editor-state/store';
import type { DocumentState, SourceEntry } from '../src/editor-state/types';

function makeSource(id: string, pageCount: number, rotate: 0 | 90 = 0): SourceEntry {
  return {
    id,
    name: `${id}.pdf`,
    bytes: new Uint8Array([id.charCodeAt(0)]),
    pageCount,
    pageInfos: Array.from({ length: pageCount }, () => ({ width: 600, height: 800, rotate })),
  };
}

const store = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState();

function active(): DocumentState {
  const docState = selectActiveDocument(store());
  if (!docState) throw new Error('no active document');
  return docState;
}

beforeEach(() => {
  useEditorStore.setState({ ...initialSnapshot, recents: [] });
});

describe('pageDisplayInfo', () => {
  it('combines inherent and user rotation and swaps dimensions', () => {
    store().addSource(makeSource('a', 1, 90));
    const page = active().doc.pages[0]!;
    let info = pageDisplayInfo(store(), page);
    expect(info).toEqual({ width: 800, height: 600, totalRotation: 90 });

    store().rotatePage(page.id, 90);
    info = pageDisplayInfo(store(), active().doc.pages[0]!);
    expect(info).toEqual({ width: 600, height: 800, totalRotation: 180 });
  });
});

describe('buildAssembleInput', () => {
  it('includes only referenced sources and assets', () => {
    store().addSource(makeSource('a', 2));
    store().addSource(makeSource('b', 1));
    const pageA = active().doc.pages[0]!;

    const asset = {
      id: 'asset-1',
      mime: 'image/png' as const,
      bytes: new Uint8Array([9]),
      width: 1,
      height: 1,
    };
    const image: Annotation = {
      kind: 'image',
      id: 'img',
      pageId: pageA.id,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      assetId: 'asset-1',
    };
    store().addAnnotation(image, asset);

    const input = buildAssembleInput(store(), active(), [pageA.id]);
    expect(Object.keys(input.sources)).toEqual(['a']);
    expect(Object.keys(input.assets)).toEqual(['asset-1']);
    expect(input.pages).toHaveLength(1);
    expect(input.pages[0]!.annotations.map((a) => a.id)).toEqual(['img']);
  });

  it('keeps the requested page order and carries rotation', () => {
    store().addSource(makeSource('a', 3));
    const [p1, , p3] = active().doc.pages;
    store().rotatePage(p3!.id, 90);
    const input = buildAssembleInput(store(), active(), [p3!.id, p1!.id]);
    expect(input.pages.map((page) => page.sourceIndex)).toEqual([2, 0]);
    expect(input.pages[0]!.rotation).toBe(90);
  });

  it('throws for unknown page ids', () => {
    store().createDocument();
    expect(() => buildAssembleInput(store(), active(), ['ghost'])).toThrow(/no longer exists/i);
  });
});

describe('page id helpers', () => {
  it('allPageIds and selectedPageIds respect document order', () => {
    store().addSource(makeSource('a', 3));
    const [p1, p2, p3] = active().doc.pages.map((page) => page.id);
    expect(allPageIds(active())).toEqual([p1, p2, p3]);

    store().selectOnly(p3!);
    store().toggleSelect(p1!); // click order: p3, p1
    expect(active().selection).toEqual([p3, p1]);
    expect(selectedPageIds(active())).toEqual([p1, p3]); // document order
  });

  it('selectedPositions reports zero-based document positions', () => {
    store().addSource(makeSource('a', 3));
    const [, p2, p3] = active().doc.pages.map((page) => page.id);
    store().selectOnly(p3!);
    store().toggleSelect(p2!);
    expect(selectedPositions(active())).toEqual([1, 2]);
  });

  it('pageIdsAtPositions maps range-parser output to ids', () => {
    store().addSource(makeSource('a', 3));
    const ids = active().doc.pages.map((page) => page.id);
    expect(pageIdsAtPositions(active(), [2, 0])).toEqual([ids[2], ids[0]]);
    expect(() => pageIdsAtPositions(active(), [9])).toThrow(/page 10/i);
  });
});

describe('isPristineBlankDocument', () => {
  const blankSource = (): SourceEntry => ({ ...makeSource('blank', 1), origin: 'blank' });

  it('is true for an untouched single blank sheet', () => {
    store().addSource(blankSource());
    expect(isPristineBlankDocument(store(), active())).toBe(true);
  });

  it('turns false once a real file, annotation, or extra page exists', () => {
    store().addSource(blankSource());
    store().addAnnotation({
      kind: 'highlight',
      id: 'h1',
      pageId: active().doc.pages[0]!.id,
      rect: { x: 0, y: 0, width: 5, height: 5 },
      color: '#ffd43b',
      opacity: 0.5,
    });
    expect(isPristineBlankDocument(store(), active())).toBe(false);

    useEditorStore.setState({ ...initialSnapshot, recents: [] });
    store().addSource(makeSource('a', 1));
    expect(isPristineBlankDocument(store(), active())).toBe(false);

    useEditorStore.setState({ ...initialSnapshot, recents: [] });
    store().addSource(blankSource());
    store().duplicatePages([active().doc.pages[0]!.id]);
    expect(isPristineBlankDocument(store(), active())).toBe(false);
  });

  it('judges the given document, not the whole workspace', () => {
    store().addSource(blankSource());
    const blankDoc = active();
    store().createDocument();
    store().addSource(makeSource('a', 2));
    expect(isPristineBlankDocument(store(), blankDoc)).toBe(true);
    expect(isPristineBlankDocument(store(), active())).toBe(false);
  });
});
