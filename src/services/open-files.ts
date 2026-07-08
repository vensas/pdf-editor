/**
 * File-import orchestration: validates picked/dropped files, loads them with
 * pdf.js (locally — bytes never leave the machine), and registers them with
 * the render service and the editor store.
 *
 * Two modes:
 * - 'open' (default): every file becomes its own document tab.
 * - 'merge': pages are appended/inserted into the active document.
 * In both modes, an untouched blank starter sheet is replaced, not kept.
 */

import { classifyPdfError, PdfError } from '../pdf-core/errors';
import { renderService } from '../rendering/render-service';
import { isPristineBlankDocument } from '../editor-state/selectors';
import { selectActiveDocument, useEditorStore } from '../editor-state/store';
import type { DocumentId, RecentDoc } from '../editor-state/types';
import { closeDocument } from './new-document';

export interface OpenResult {
  openedPages: number;
  openedFiles: number;
  errors: { name: string; message: string }[];
}

export interface OpenOptions {
  /** 'open' = one tab per file (default); 'merge' = into the active document. */
  mode?: 'open' | 'merge';
  /** Merge only: zero-based page position to insert at. */
  insertAt?: number;
}

export async function openFiles(
  files: readonly File[],
  options?: OpenOptions,
): Promise<OpenResult> {
  const mode = options?.mode ?? 'open';
  const result: OpenResult = { openedPages: 0, openedFiles: 0, errors: [] };
  let insertAt = options?.insertAt;

  const pdfFiles: File[] = [];
  for (const file of files) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      pdfFiles.push(file);
    } else {
      result.errors.push({ name: file.name, message: 'Not a PDF file.' });
    }
  }
  if (pdfFiles.length === 0) return result;

  // Importing over the untouched starter sheet replaces it — appending behind
  // an empty blank page is never what the user meant. An explicit insert
  // position is respected as-is.
  if (insertAt === undefined) {
    await discardPristineBlankActive();
  }

  let mergeTargetId: DocumentId | undefined;
  if (mode === 'merge') {
    mergeTargetId = useEditorStore.getState().activeDocumentId ?? undefined;
  }

  for (const file of pdfFiles) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const documentId =
        mode === 'merge'
          ? mergeTargetId
          : useEditorStore.getState().createDocument({ activate: true });
      const added = await addSourceFromBytes(file.name, bytes, { documentId, insertAt });
      if (insertAt !== undefined) insertAt += added;
      result.openedPages += added;
      result.openedFiles += 1;
    } catch (error) {
      result.errors.push({ name: file.name, message: classifyPdfError(error, 'corrupt').message });
    }
  }

  return result;
}

/** Reopens a closed document in a new tab. */
export async function reopenRecent(recent: RecentDoc): Promise<void> {
  try {
    await discardPristineBlankActive();
    const documentId = useEditorStore.getState().createDocument({ activate: true });
    await addSourceFromBytes(recent.name, recent.bytes, { documentId });
    useEditorStore.getState().removeRecent(recent.id);
  } catch (error) {
    throw classifyPdfError(error, 'corrupt');
  }
}

async function discardPristineBlankActive(): Promise<void> {
  const state = useEditorStore.getState();
  const active = selectActiveDocument(state);
  if (active && isPristineBlankDocument(state, active)) {
    // Blank sources never enter recents, so this only drops the empty sheet.
    // (closeDocument would re-create a blank tab when it is the last one, but
    // the caller opens a new document right after, so skip that dance.)
    const { releasedSources } = useEditorStore.getState().closeDocument(active.id);
    for (const sourceId of releasedSources) renderService.release(sourceId);
  }
}

async function addSourceFromBytes(
  name: string,
  bytes: Uint8Array,
  options: { documentId?: DocumentId | undefined; insertAt?: number | undefined },
): Promise<number> {
  const sourceId = crypto.randomUUID();
  const registered = await renderService.register(sourceId, bytes);
  if (registered.pageCount === 0) {
    renderService.release(sourceId);
    throw new PdfError('corrupt', 'This PDF has no pages.');
  }
  useEditorStore.getState().addSource(
    {
      id: sourceId,
      name,
      bytes,
      pageCount: registered.pageCount,
      pageInfos: registered.pageInfos,
      origin: 'file',
    },
    {
      ...(options.documentId !== undefined ? { documentId: options.documentId } : {}),
      ...(options.insertAt !== undefined ? { insertAt: options.insertAt } : {}),
    },
  );
  return registered.pageCount;
}

export { closeDocument };
