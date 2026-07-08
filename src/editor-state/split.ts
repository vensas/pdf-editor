/**
 * Pure splitting of one open document into several new ones. No PDF bytes
 * are touched: the new documents reference the same sources, so a split is
 * instant and each result stays fully editable until it is exported.
 */

import { formatPageLabel } from '../pdf-core/ranges';
import type { Annotation } from '../pdf-core/types';
import type { DocumentState } from './types';

export interface MakeId {
  (): string;
}

const defaultMakeId: MakeId = () => crypto.randomUUID();

/**
 * Builds one new DocumentState per group of zero-based page positions
 * (typically from parseRanges()). Page refs and their annotations are copied
 * with fresh ids so the results are fully independent of the original.
 */
export function splitDocumentState(
  source: DocumentState,
  groups: readonly (readonly number[])[],
  makeId: MakeId = defaultMakeId,
): DocumentState[] {
  return groups.map((group) => {
    const pages = group.map((position) => {
      const page = source.doc.pages[position];
      if (!page) {
        throw new Error(`Page ${position + 1} does not exist.`);
      }
      return { ...page, id: makeId() };
    });

    const annotations: Record<string, Annotation> = {};
    group.forEach((position, index) => {
      const originalPage = source.doc.pages[position]!;
      const newPageId = pages[index]!.id;
      for (const annotation of Object.values(source.doc.annotations)) {
        if (annotation.pageId === originalPage.id) {
          const id = makeId();
          annotations[id] = { ...annotation, id, pageId: newPageId };
        }
      }
    });

    return {
      id: makeId(),
      doc: { pages, annotations },
      past: [],
      future: [],
      selection: [],
      selectionAnchor: null,
      activePageId: pages[0]?.id ?? null,
      activeAnnotationId: null,
      docName: `${source.docName}_pages_${formatPageLabel([...group])}`,
      docNameClaimed: true,
    };
  });
}
