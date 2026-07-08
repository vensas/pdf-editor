/**
 * Export orchestration: builds worker inputs from the active document, runs
 * assembly/zip in the export worker (with progress reporting), and triggers
 * local downloads. Nothing here ever touches the network.
 *
 * Splitting is NOT an export anymore: it opens the results as new document
 * tabs (a pure state operation) — each can be reviewed, edited, and exported
 * from there.
 */

import { formatPageLabel, parseRanges } from '../pdf-core/ranges';
import type { PageId } from '../pdf-core/types';
import {
  allPageIds,
  buildAssembleInput,
  selectedPageIds,
  selectedPositions,
} from '../editor-state/selectors';
import { selectActiveDocument, useEditorStore } from '../editor-state/store';
import type { DocumentState } from '../editor-state/types';
import { downloadPdf, downloadZip, safeBaseName } from '../export/download';
import { pdfWorker } from '../workers/pdf-worker-client';

function requireActiveDocument(): DocumentState {
  const docState = selectActiveDocument(useEditorStore.getState());
  if (!docState || docState.doc.pages.length === 0) {
    throw new Error('There is no document to export.');
  }
  return docState;
}

async function withBusy<T>(label: string, work: () => Promise<T>): Promise<T> {
  const { setBusy } = useEditorStore.getState();
  setBusy({ label, progress: null });
  try {
    return await work();
  } finally {
    setBusy(null);
  }
}

function progressHandler(): (done: number, total: number) => void {
  return (done, total) => {
    const state = useEditorStore.getState();
    if (state.busy) {
      state.setBusy({ label: state.busy.label, progress: total === 0 ? null : done / total });
    }
  };
}

async function assembleAndDownload(
  docState: DocumentState,
  pageIds: readonly PageId[],
  fileName: string,
): Promise<void> {
  await withBusy('Building PDF', async () => {
    const input = buildAssembleInput(useEditorStore.getState(), docState, pageIds);
    const [bytes] = await pdfWorker.assemble(
      [{ pages: input.pages }],
      input.sources,
      input.assets,
      progressHandler(),
    );
    if (!bytes) throw new Error('Export produced no document.');
    downloadPdf(bytes, fileName);
  });
}

/** Exports the whole active document — always all pages, selection ignored. */
/**
 * Prints the whole active document with all edits and annotations baked in:
 * the same assembly as an export, handed to the browser's print dialog via a
 * hidden iframe. Falls back to opening a tab (Safari's iframe PDF printing
 * is unreliable) and, if pop-ups are blocked, to a plain download.
 */
export async function printDocument(): Promise<void> {
  const docState = requireActiveDocument();
  const fileName = `${safeBaseName(docState.docName)}.pdf`;

  await withBusy('Preparing print', async () => {
    const input = buildAssembleInput(useEditorStore.getState(), docState, allPageIds(docState));
    const [bytes] = await pdfWorker.assemble(
      [{ pages: input.pages }],
      input.sources,
      input.assets,
      progressHandler(),
    );
    if (!bytes) throw new Error('Preparing the print produced no document.');

    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
    const opened = await openPrintDialog(url);
    if (!opened) {
      URL.revokeObjectURL(url);
      downloadPdf(bytes, fileName);
      throw new Error(
        'The print view was blocked by the browser — the PDF was downloaded instead; print it from your PDF viewer.',
      );
    }
  });
}

function openPrintDialog(url: string): Promise<boolean> {
  // Safari cannot reliably print PDFs from an iframe; a viewer tab can.
  const isSafari = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    return Promise.resolve(window.open(url, '_blank') !== null);
  }

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        resolve(true);
      } catch {
        iframe.remove();
        resolve(window.open(url, '_blank') !== null);
      }
    };
    document.body.append(iframe);
    // The iframe must outlive the print dialog; reclaim resources later.
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  });
}

export async function exportDocument(): Promise<void> {
  const docState = requireActiveDocument();
  await assembleAndDownload(
    docState,
    allPageIds(docState),
    `${safeBaseName(docState.docName)}_edited.pdf`,
  );
}

/** Exports only the selected pages (in document order) as one PDF. */
export async function exportSelection(): Promise<void> {
  const docState = requireActiveDocument();
  const ids = selectedPageIds(docState);
  if (ids.length === 0) {
    throw new Error('Select at least one page first.');
  }
  const label = formatPageLabel(selectedPositions(docState));
  await assembleAndDownload(docState, ids, `${safeBaseName(docState.docName)}_pages_${label}.pdf`);
}

/** Exports every page of the active document as its own PDF inside a ZIP. */
export async function exportPagesAsZip(): Promise<void> {
  const docState = requireActiveDocument();
  const base = safeBaseName(docState.docName);

  await withBusy('Building ZIP', async () => {
    const state = useEditorStore.getState();
    const ids = allPageIds(docState);
    const jobs = ids.map((id) => ({
      pages: buildAssembleInput(state, docState, [id]).pages,
    }));
    const full = buildAssembleInput(state, docState, ids);
    const documents = await pdfWorker.assemble(jobs, full.sources, full.assets, progressHandler());

    const files = documents.map((bytes, index) => ({
      name: `${base}_page_${index + 1}.pdf`,
      bytes,
    }));
    downloadZip(await pdfWorker.zip(files), `${base}_pages.zip`);
  });
}

/**
 * Splits the active document by a range expression like "1-3, 5, 8-10" into
 * new document tabs (one per group) and activates the first. Returns the
 * number of documents created.
 */
export function splitIntoDocuments(rangesText: string): number {
  const docState = requireActiveDocument();
  const groups = parseRanges(rangesText, docState.doc.pages.length);
  return useEditorStore.getState().openSplitDocuments(groups).length;
}
