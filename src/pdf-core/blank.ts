/**
 * Creation of empty documents/pages. A blank page is just a normal one-page
 * source PDF, so the whole pipeline (rendering, reordering, annotating,
 * exporting) treats it like any imported file.
 */

import { PDFDocument } from 'pdf-lib';

/** A4 portrait in PDF points. */
export const BLANK_PAGE_SIZE = { width: 595.28, height: 841.89 } as const;

export interface BlankPageSize {
  width: number;
  height: number;
}

export async function createBlankPdf(
  pageCount = 1,
  size: BlankPageSize = BLANK_PAGE_SIZE,
): Promise<Uint8Array> {
  if (pageCount < 1) {
    throw new Error('A document needs at least one page.');
  }
  const doc = await PDFDocument.create();
  doc.setProducer('vensas PDF Editor');
  for (let index = 0; index < pageCount; index++) {
    doc.addPage([size.width, size.height]);
  }
  return doc.save();
}
