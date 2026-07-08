import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { BLANK_PAGE_SIZE, createBlankPdf } from '../src/pdf-core/blank';

describe('createBlankPdf', () => {
  it('creates a valid one-page A4 document by default', async () => {
    const bytes = await createBlankPdf();
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(BLANK_PAGE_SIZE.width);
    expect(height).toBeCloseTo(BLANK_PAGE_SIZE.height);
  });

  it('creates the requested number of pages with a custom size', async () => {
    const bytes = await createBlankPdf(3, { width: 400, height: 400 });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(2).getSize()).toEqual({ width: 400, height: 400 });
  });

  it('rejects zero pages', async () => {
    await expect(createBlankPdf(0)).rejects.toThrow(/at least one page/i);
  });
});
