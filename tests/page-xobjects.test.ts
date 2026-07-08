import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assemblePdf } from '../src/pdf-core/assemble';
import { pageObjectDraws, readPageContent } from '../src/pdf-core/page-xobjects';
import type { Annotation, AssembleInput } from '../src/pdf-core/types';

/** A tiny valid 1x1 red PNG. */
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

/** Builds a one-page PDF with an embedded PNG drawn at a known box. */
async function makePdfWithImage(): Promise<{
  bytes: Uint8Array;
  box: { x: number; y: number; width: number; height: number };
}> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const png = await doc.embedPng(PNG_1PX);
  const box = { x: 400, y: 700, width: 150, height: 50 };
  page.drawText('keep me', { x: 40, y: 400, size: 24 });
  page.drawImage(png, box);
  return { bytes: await doc.save(), box };
}

describe('page object detection + removal', () => {
  it('detects the embedded image draw with its user-space box', async () => {
    const { bytes, box } = await makePdfWithImage();
    const doc = await PDFDocument.load(bytes);
    const draws = pageObjectDraws(doc.getPage(0));
    expect(draws).toHaveLength(1);
    expect(draws[0]!.type).toBe('image');
    expect(draws[0]!.rect.x).toBeCloseTo(box.x, 0);
    expect(draws[0]!.rect.y).toBeCloseTo(box.y, 0);
    expect(draws[0]!.rect.width).toBeCloseTo(box.width, 0);
    expect(draws[0]!.rect.height).toBeCloseTo(box.height, 0);
  });

  it('removes the image from the exported PDF via an object-removal annotation', async () => {
    const { bytes, box } = await makePdfWithImage();

    // The removal annotation carries a display-space rect; convert the known
    // user-space box (origin bottom-left) to display space (origin top-left).
    const displayRect = {
      x: box.x,
      y: 800 - (box.y + box.height),
      width: box.width,
      height: box.height,
    };
    const removal: Annotation = {
      kind: 'object-removal',
      id: 'r1',
      pageId: 'p',
      rect: displayRect,
      label: 'Image',
    };

    const input: AssembleInput = {
      pages: [{ sourceId: 's', sourceIndex: 0, rotation: 0, annotations: [removal] }],
      sources: { s: bytes },
      assets: {},
    };
    const out = await assemblePdf(input);
    const outDoc = await PDFDocument.load(out);

    // The image draw is gone from the page content; the text remains
    // (pdf-lib hex-encodes it: "keep me" -> 6B656570206D65).
    const content = readPageContent(outDoc.getPage(0));
    expect(pageObjectDraws(outDoc.getPage(0))).toHaveLength(0);
    expect(content).toContain('6B656570206D65');
    expect(content).toContain('Tj');
    expect(outDoc.getPageCount()).toBe(1);
  });

  it('leaves the document intact when the removal box matches nothing', async () => {
    const { bytes } = await makePdfWithImage();
    const removal: Annotation = {
      kind: 'object-removal',
      id: 'r1',
      pageId: 'p',
      rect: { x: 0, y: 0, width: 5, height: 5 },
      label: 'Image',
    };
    const out = await assemblePdf({
      pages: [{ sourceId: 's', sourceIndex: 0, rotation: 0, annotations: [removal] }],
      sources: { s: bytes },
      assets: {},
    });
    const outDoc = await PDFDocument.load(out);
    expect(pageObjectDraws(outDoc.getPage(0))).toHaveLength(1);
  });
});
