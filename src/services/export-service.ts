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
