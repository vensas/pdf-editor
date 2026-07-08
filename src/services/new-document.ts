/**
 * Document lifecycle orchestration: blank sheets, new tabs, and closing
 * documents (including releasing pdf.js resources for sources no other open
 * document uses). The app always keeps at least one document open.
 */

import type { DocumentId } from '../editor-state/types';
import { useEditorStore } from '../editor-state/store';
import { renderService } from '../rendering/render-service';

/** Inserts one blank A4 page into a document (the active one by default). */
export async function addBlankPage(options?: {
  documentId?: DocumentId;
  insertAt?: number;
}): Promise<void> {
  // Lazy import keeps pdf-lib out of the initial bundle.
  const { createBlankPdf } = await import('../pdf-core/blank');
  const bytes = await createBlankPdf(1);
  const sourceId = crypto.randomUUID();
  const registered = await renderService.register(sourceId, bytes);
  useEditorStore.getState().addSource(
    {
      id: sourceId,
      name: 'Blank page.pdf',
      bytes,
      pageCount: registered.pageCount,
      pageInfos: registered.pageInfos,
      origin: 'blank',
    },
    {
      ...(options?.documentId !== undefined ? { documentId: options.documentId } : {}),
      ...(options?.insertAt !== undefined ? { insertAt: options.insertAt } : {}),
    },
  );
}

/** Opens a new tab containing a single blank sheet and activates it. */
export async function newBlankDocument(): Promise<DocumentId> {
  const id = useEditorStore.getState().createDocument();
  await addBlankPage({ documentId: id });
  return id;
}

/**
 * Closes a document, releases sources no other open document needs, and
 * guarantees at least one (blank) document stays open.
 */
export async function closeDocument(id: DocumentId): Promise<void> {
  const { releasedSources } = useEditorStore.getState().closeDocument(id);
  for (const sourceId of releasedSources) renderService.release(sourceId);
  if (useEditorStore.getState().documentOrder.length === 0) {
    await newBlankDocument();
  }
}

let ensuring: Promise<void> | null = null;

/**
 * Guarantees the editor shows a document. Idempotent and re-entrant so React
 * StrictMode's double-mounted effects can't create two blank documents.
 */
export function ensureDocument(): Promise<void> {
  ensuring ??= (async () => {
    if (useEditorStore.getState().documentOrder.length === 0) {
      await newBlankDocument();
    }
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}
