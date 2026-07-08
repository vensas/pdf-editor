/**
 * Detects removable page objects (image / form XObjects) for the
 * remove-object tool. Loads the source with pdf-lib (lazily, cached per
 * source) and returns each drawn XObject as a display-space rectangle that
 * the UI can turn into a clickable hotspot.
 *
 * Detection uses the same content-stream walk as removal, so a detected box
 * always corresponds to a draw the exporter can actually delete.
 */

import type { PDFDocument } from 'pdf-lib';
import { pdfRectToDisplay } from '../pdf-core/geometry';
import { pageObjectDraws } from '../pdf-core/page-xobjects';
import type { Rect, Rotation } from '../pdf-core/types';

export interface DetectedObject {
  id: string;
  label: string;
  /** Bounding box in display space. */
  rect: Rect;
}

const docCache = new Map<string, Promise<PDFDocument>>();

async function loadDoc(sourceId: string, bytes: Uint8Array): Promise<PDFDocument> {
  const cached = docCache.get(sourceId);
  if (cached) return cached;
  const promise = (async () => {
    const { PDFDocument } = await import('pdf-lib');
    return PDFDocument.load(bytes, { ignoreEncryption: false });
  })();
  docCache.set(sourceId, promise);
  return promise;
}

export function releaseObjectDoc(sourceId: string): void {
  docCache.delete(sourceId);
}

/**
 * Returns the removable objects on one source page, positioned for the given
 * total displayed rotation. Never throws — returns [] on any failure.
 */
export async function detectObjects(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
  rotation: Rotation,
): Promise<DetectedObject[]> {
  try {
    const doc = await loadDoc(sourceId, bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) return [];
    const page = doc.getPage(pageIndex);
    const { width, height } = page.getSize();
    return pageObjectDraws(page).map((draw, index) => ({
      id: `${pageIndex}:${index}`,
      label: draw.type === 'image' ? 'Image' : 'Graphic',
      rect: pdfRectToDisplay(draw.rect, width, height, rotation),
    }));
  } catch {
    return [];
  }
}
