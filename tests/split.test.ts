import { describe, expect, it } from 'vitest';
import { splitDocumentState } from '../src/editor-state/split';
import { emptyDocumentState } from '../src/editor-state/store';
import type { DocumentState } from '../src/editor-state/types';
import type { Annotation, PageRef } from '../src/pdf-core/types';

function makeIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function docWithPages(count: number): DocumentState {
  const pages: PageRef[] = Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    sourceId: 'src',
    sourceIndex: index,
    rotation: index === 1 ? 90 : 0,
  }));
  const annotations: Record<string, Annotation> = {
    'a-1': {
      kind: 'highlight',
      id: 'a-1',
      pageId: 'p-1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      color: '#ffd43b',
      opacity: 0.5,
    },
    'a-2': {
      kind: 'text',
      id: 'a-2',
      pageId: 'p-3',
      rect: { x: 0, y: 0, width: 100, height: 30 },
      text: 'hello',
      fontSize: 14,
      color: '#112233',
    },
  };
  return {
    ...emptyDocumentState('doc-1', 'Report'),
    doc: { pages, annotations },
    docNameClaimed: true,
  };
}

describe('splitDocumentState', () => {
  it('creates one document per group with fresh page ids and copied rotation', () => {
    const source = docWithPages(4);
    const [first, second] = splitDocumentState(source, [[0, 1], [3]], makeIds());
    expect(first!.doc.pages.map((page) => page.sourceIndex)).toEqual([0, 1]);
    expect(first!.doc.pages[1]!.rotation).toBe(90);
    expect(second!.doc.pages.map((page) => page.sourceIndex)).toEqual([3]);

    const allNewIds = [...first!.doc.pages, ...second!.doc.pages].map((page) => page.id);
    expect(new Set(allNewIds).size).toBe(allNewIds.length);
    expect(allNewIds.every((id) => id.startsWith('id-'))).toBe(true);
  });

  it('copies only the annotations of the included pages and re-binds them', () => {
    const source = docWithPages(4);
    const [first, second] = splitDocumentState(source, [[0], [2]], makeIds());

    const firstAnnotations = Object.values(first!.doc.annotations);
    expect(firstAnnotations).toHaveLength(1);
    expect(firstAnnotations[0]!.kind).toBe('highlight');
    expect(firstAnnotations[0]!.pageId).toBe(first!.doc.pages[0]!.id);
    expect(firstAnnotations[0]!.id).not.toBe('a-1');

    const secondAnnotations = Object.values(second!.doc.annotations);
    expect(secondAnnotations).toHaveLength(1);
    expect(secondAnnotations[0]!.kind).toBe('text');
  });

  it('names the results after the source document and range', () => {
    const source = docWithPages(4);
    const [first, second] = splitDocumentState(source, [
      [0, 1, 2],
      [3, 3],
    ]);
    expect(first!.docName).toBe('Report_pages_1-3');
    expect(second!.docName).toBe('Report_pages_4_4');
    expect(first!.docNameClaimed).toBe(true);
  });

  it('starts the new documents with clean history and selection', () => {
    const source = { ...docWithPages(2), past: [{ pages: [], annotations: {} }] };
    const [result] = splitDocumentState(source, [[0]]);
    expect(result!.past).toEqual([]);
    expect(result!.future).toEqual([]);
    expect(result!.selection).toEqual([]);
    expect(result!.activePageId).toBe(result!.doc.pages[0]!.id);
  });

  it('throws for out-of-range positions', () => {
    expect(() => splitDocumentState(docWithPages(2), [[5]])).toThrow(/page 6/i);
  });

  it('duplicating a page across groups keeps copies independent', () => {
    const source = docWithPages(2);
    const [a, b] = splitDocumentState(source, [[0], [0]], makeIds());
    expect(a!.doc.pages[0]!.id).not.toBe(b!.doc.pages[0]!.id);
    expect(a!.doc.pages[0]!.sourceIndex).toBe(0);
    expect(b!.doc.pages[0]!.sourceIndex).toBe(0);
  });
});
