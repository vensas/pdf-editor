/**
 * pdf.js document loading. pdf.js runs its parsing/rendering in its own
 * worker; this module wires that worker up for Rspack/Rsbuild and exposes a
 * narrow, typed surface for the rest of the app.
 */

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { classifyPdfError, PdfError } from '../pdf-core/errors';
import { normalizeRotation } from '../pdf-core/geometry';
import { textItemsToRuns, type RawTextItem, type TextRun } from '../pdf-core/text-runs';
import type { Rotation, SourcePageInfo } from '../pdf-core/types';

/**
 * pdf.js forbids two concurrent render() calls on the same canvas — a page
 * that re-renders while the previous render is still in flight (zoom change,
 * rotation, React StrictMode double-effects) would otherwise throw and show
 * a bogus "page could not be rendered" error. Track the in-flight task per
 * canvas so a new render always cancels and awaits its predecessor first.
 */
const activeRenders = new WeakMap<HTMLCanvasElement, RenderTask>();

let workerStarted = false;

function ensureWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  );
}

export interface RenderTarget {
  canvas: HTMLCanvasElement;
  /** CSS pixel width the page should occupy. */
  cssWidth: number;
  /** User rotation delta on top of the page's inherent rotation, clockwise. */
  rotation: Rotation;
  /** Device pixel ratio multiplier; defaults to window.devicePixelRatio. */
  pixelRatio?: number;
}

export interface LoadedPdfDocument {
  pageCount: number;
  /** Per-page MediaBox size and inherent rotation, in source page order. */
  pageInfos: SourcePageInfo[];
  /**
   * Editable text runs of a page, in display space for the given user
   * rotation (see src/pdf-core/text-runs.ts).
   */
  getTextRuns(pageIndex: number, rotation: Rotation): Promise<TextRun[]>;
  renderPage(pageIndex: number, target: RenderTarget): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Loads a PDF for rendering. The bytes are copied before handing them to
 * pdf.js because it transfers the underlying buffer to its worker.
 *
 * Throws PdfError with code 'encrypted' / 'corrupt' / 'not-a-pdf' on failure.
 */
export async function loadPdfDocument(bytes: Uint8Array): Promise<LoadedPdfDocument> {
  ensureWorker();

  // The loading task owns the document's worker resources; since pdf.js 6 it
  // is also the only way to destroy them.
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    throw classifyPdfError(error, 'corrupt');
  }

  const pageInfos: SourcePageInfo[] = [];
  for (let index = 1; index <= doc.numPages; index++) {
    const page = await doc.getPage(index);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    pageInfos.push({
      width: viewport.width,
      height: viewport.height,
      rotate: normalizeRotation(page.rotate),
    });
  }

  return {
    pageCount: doc.numPages,
    pageInfos,

    async getTextRuns(pageIndex, rotation): Promise<TextRun[]> {
      const page = await doc.getPage(pageIndex + 1);
      // scale 1: item advance widths come out directly in display points.
      const viewport = page.getViewport({
        scale: 1,
        rotation: normalizeRotation(page.rotate + rotation),
      });
      const content = await page.getTextContent();
      // TextMarkedContent items lack `str`/`transform`; keep only real runs.
      const items: RawTextItem[] = content.items.flatMap((item) =>
        'str' in item && 'transform' in item
          ? [{ str: item.str, width: item.width, height: item.height, transform: item.transform }]
          : [],
      );
      return textItemsToRuns(items, viewport.transform);
    },

    async renderPage(pageIndex, target): Promise<void> {
      const page = await doc.getPage(pageIndex + 1);
      const rotation = normalizeRotation(page.rotate + target.rotation);
      const base = page.getViewport({ scale: 1, rotation });
      const cssScale = target.cssWidth / base.width;
      const ratio = target.pixelRatio ?? window.devicePixelRatio ?? 1;
      const viewport = page.getViewport({ scale: cssScale * ratio, rotation });

      const { canvas } = target;

      // Supersede any render still drawing into this canvas (and wait for it
      // to actually stop before resizing the canvas out from under it).
      const previous = activeRenders.get(canvas);
      if (previous) {
        previous.cancel();
        await previous.promise.catch(() => undefined);
      }

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.round(target.cssWidth)}px`;
      canvas.style.height = `${Math.round(viewport.height / ratio)}px`;

      // pdf.js 6 draws into the canvas directly (canvasContext was removed).
      const task = page.render({ canvas, viewport });
      activeRenders.set(canvas, task);
      try {
        await task.promise;
      } catch (error) {
        // A superseded render is not a failure — the newer one will paint.
        if (error instanceof Error && error.name === 'RenderingCancelledException') return;
        throw error instanceof PdfError ? error : classifyPdfError(error, 'render-failed');
      } finally {
        if (activeRenders.get(canvas) === task) activeRenders.delete(canvas);
        try {
          page.cleanup();
        } catch {
          // cleanup() can refuse while another render of this page runs.
        }
      }
    },

    async destroy(): Promise<void> {
      await loadingTask.destroy();
    },
  };
}
