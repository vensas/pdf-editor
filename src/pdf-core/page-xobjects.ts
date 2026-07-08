/**
 * pdf-lib bridge for the content-stream object tools: read a page's decoded
 * content stream and its XObject metadata, list the XObjects it draws, and
 * write back a page with selected draws removed.
 */

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import {
  listXObjectDraws,
  removeXObjectDraws,
  type Matrix6,
  type Rect4,
  type XObjectDraw,
  type XObjectInfo,
} from './content-stream';

const LATIN1 = new TextDecoder('latin1');

/** Reads the page's XObject resources into the metadata the walker needs. */
export function readPageXObjects(page: PDFPage): Record<string, XObjectInfo> {
  const result: Record<string, XObjectInfo> = {};
  const resources = page.node.Resources();
  if (!resources) return result;
  const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return result;

  for (const [key] of xobjects.entries()) {
    const stream = xobjects.lookup(key);
    const dict =
      stream instanceof PDFRawStream ? stream.dict : stream instanceof PDFDict ? stream : undefined;
    if (!dict) continue;
    const name = key.toString().slice(1);
    const subtype = dict.get(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Image') {
      result[name] = { type: 'image' };
    } else if (subtype === '/Form') {
      const bboxArray = dict.lookupMaybe(PDFName.of('BBox'), PDFArray);
      const bbox = bboxArray
        ? (numbers(bboxArray, 4) as [number, number, number, number])
        : undefined;
      const matrixArray = dict.lookupMaybe(PDFName.of('Matrix'), PDFArray);
      const matrix = matrixArray ? (numbers(matrixArray, 6) as Matrix6) : undefined;
      result[name] = {
        type: 'form',
        bbox: bbox ?? [0, 0, 1, 1],
        ...(matrix ? { matrix } : {}),
      };
    }
  }
  return result;
}

function numbers(array: PDFArray, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const value = array.get(i);
    return value instanceof PDFNumber ? value.asNumber() : Number.NaN;
  });
}

/** Decodes and concatenates the page's content stream(s) into one string. */
export function readPageContent(page: PDFPage): string {
  const context = page.doc.context;
  const contents = page.node.get(PDFName.of('Contents'));
  if (!contents) return '';
  const resolved = context.lookup(contents);
  const streams =
    resolved instanceof PDFArray
      ? Array.from({ length: resolved.size() }, (_, i) => context.lookup(resolved.get(i)))
      : [resolved];
  return streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => LATIN1.decode(decodePDFRawStream(stream).decode()))
    .join('\n');
}

/** Lists the image/form XObjects a page draws, with user-space bounding boxes. */
export function pageObjectDraws(page: PDFPage): XObjectDraw[] {
  return listXObjectDraws(readPageContent(page), readPageXObjects(page));
}

/**
 * Removes the XObject draws whose placement matches any target rect (PDF user
 * space) from the page, by replacing its Contents with a single decoded,
 * edited content stream. Returns the number of draws removed.
 */
export function removePageObjects(page: PDFPage, targets: readonly Rect4[], tolerance = 2): number {
  if (targets.length === 0) return 0;
  const content = readPageContent(page);
  const { content: edited, removed } = removeXObjectDraws(
    content,
    targets,
    readPageXObjects(page),
    tolerance,
  );
  if (removed === 0) return 0;

  const context = page.doc.context;
  // Replace all content streams with one uncompressed, edited stream.
  const newStream = context.flateStream(edited);
  const ref = context.register(newStream);
  page.node.set(PDFName.of('Contents'), ref);
  return removed;
}
