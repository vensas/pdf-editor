/**
 * End-to-end tests of the pdf-lib assembler: real PDFs in, real PDFs out.
 * Covers extraction, ordering, merging, rotation baking, and annotation
 * flattening — the engine behind every export/split/merge in the app.
 */

import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assembleDocuments, assemblePdf } from '../src/pdf-core/assemble';
import { PdfError } from '../src/pdf-core/errors';
import type { Annotation, AssembleInput, PagePlanItem } from '../src/pdf-core/types';

/** A tiny valid 1x1 red PNG. */
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

/** Builds a source PDF whose page N is `width` x `height`, with page-number text. */
async function makeSourcePdf(
  pageCount: number,
  options?: { rotate?: number; width?: number; height?: number },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    const page = doc.addPage([options?.width ?? 600, options?.height ?? 800]);
    page.drawText(`Page ${index + 1}`, { x: 50, y: 700, size: 24 });
    // Vary the width per page so tests can identify pages after copying.
    page.setWidth((options?.width ?? 600) + index);
    if (options?.rotate) page.setRotation(degrees(options.rotate));
    page.drawRectangle({ x: 10, y: 10, width: 30, height: 30, color: rgb(0.2, 0.4, 0.6) });
  }
  return doc.save();
}

function plan(
  sourceId: string,
  sourceIndex: number,
  overrides?: Partial<PagePlanItem>,
): PagePlanItem {
  return { sourceId, sourceIndex, rotation: 0, annotations: [], ...overrides };
}

const NO_ASSETS: AssembleInput['assets'] = {};

describe('assemblePdf', () => {
  it('extracts pages in the requested order', async () => {
    const source = await makeSourcePdf(4); // widths 600..603
    const bytes = await assemblePdf({
      pages: [plan('s', 2), plan('s', 0)],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    const result = await PDFDocument.load(bytes);
    expect(result.getPageCount()).toBe(2);
    expect(result.getPage(0).getWidth()).toBe(602);
    expect(result.getPage(1).getWidth()).toBe(600);
  });

  it('merges pages from multiple sources, interleaved', async () => {
    const a = await makeSourcePdf(2); // widths 600, 601
    const b = await makeSourcePdf(2, { width: 400 }); // widths 400, 401
    const bytes = await assemblePdf({
      pages: [plan('a', 0), plan('b', 1), plan('a', 1), plan('b', 0)],
      sources: { a, b },
      assets: NO_ASSETS,
    });
    const result = await PDFDocument.load(bytes);
    expect(result.getPages().map((page) => page.getWidth())).toEqual([600, 401, 601, 400]);
  });

  it('duplicates a page when it appears twice in the plan', async () => {
    const source = await makeSourcePdf(1);
    const bytes = await assemblePdf({
      pages: [plan('s', 0), plan('s', 0)],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('bakes user rotation on top of inherent page rotation', async () => {
    const source = await makeSourcePdf(1, { rotate: 90 });
    const bytes = await assemblePdf({
      pages: [plan('s', 0, { rotation: 90 })],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    const result = await PDFDocument.load(bytes);
    expect(result.getPage(0).getRotation().angle).toBe(180);
  });

  it('wraps rotation past 360', async () => {
    const source = await makeSourcePdf(1, { rotate: 270 });
    const bytes = await assemblePdf({
      pages: [plan('s', 0, { rotation: 90 })],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    expect((await PDFDocument.load(bytes)).getPage(0).getRotation().angle).toBe(0);
  });

  it('reports progress per page', async () => {
    const source = await makeSourcePdf(3);
    const seen: [number, number][] = [];
    await assemblePdf(
      {
        pages: [plan('s', 0), plan('s', 1), plan('s', 2)],
        sources: { s: source },
        assets: NO_ASSETS,
      },
      (done, total) => seen.push([done, total]),
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('rejects an empty plan', async () => {
    await expect(assemblePdf({ pages: [], sources: {}, assets: NO_ASSETS })).rejects.toThrow(
      /at least one page/i,
    );
  });

  it('rejects out-of-range source pages', async () => {
    const source = await makeSourcePdf(1);
    await expect(
      assemblePdf({ pages: [plan('s', 5)], sources: { s: source }, assets: NO_ASSETS }),
    ).rejects.toThrow(/out of range/i);
  });

  it('rejects missing sources with a PdfError', async () => {
    await expect(
      assemblePdf({ pages: [plan('missing', 0)], sources: {}, assets: NO_ASSETS }),
    ).rejects.toBeInstanceOf(PdfError);
  });

  it('classifies corrupt source bytes', async () => {
    const garbage = new TextEncoder().encode('definitely not a pdf');
    await expect(
      assemblePdf({ pages: [plan('s', 0)], sources: { s: garbage }, assets: NO_ASSETS }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/corrupt|not-a-pdf/) });
  });
});

describe('annotation baking', () => {
  const rect = { x: 50, y: 60, width: 120, height: 40 };

  async function bakeOne(annotations: Annotation[], rotation: 0 | 90 = 0): Promise<PDFDocument> {
    const source = await makeSourcePdf(1);
    const bytes = await assemblePdf({
      pages: [plan('s', 0, { rotation, annotations })],
      sources: { s: source },
      assets: { 'asset-1': { mime: 'image/png', bytes: PNG_1PX } },
    });
    return PDFDocument.load(bytes);
  }

  const annotationOf = (kind: string, extra: object): Annotation =>
    ({ id: 'a', pageId: 'p', rect, kind, ...extra }) as Annotation;

  it('bakes every annotation kind without corrupting the document', async () => {
    const result = await bakeOne([
      annotationOf('text', { text: 'Hello Wörld\nSecond line', fontSize: 14, color: '#112233' }),
      annotationOf('rich-text', {
        blocks: [
          {
            spans: [
              { text: 'plain ' },
              { text: 'bold', bold: true },
              { text: ' both', bold: true, italic: true },
            ],
          },
          {
            spans: [
              { text: 'under', underline: true },
              { text: 'struck', strike: true },
            ],
          },
        ],
        fontSize: 14,
        color: '#112233',
      }),
      annotationOf('highlight', { color: '#ffd43b', opacity: 0.4 }),
      annotationOf('shape', {
        shape: 'rectangle',
        color: '#c2372e',
        strokeWidth: 2,
        fill: '#ffffff',
      }),
      annotationOf('shape', { shape: 'ellipse', color: '#c2372e', strokeWidth: 2 }),
      annotationOf('shape', { shape: 'line', color: '#000000', strokeWidth: 1 }),
      annotationOf('shape', { shape: 'arrow', color: '#000000', strokeWidth: 2, mirrored: true }),
      annotationOf('ink', {
        paths: [
          [
            { x: 0, y: 0 },
            { x: 0.5, y: 0.7 },
            { x: 1, y: 1 },
          ],
          [{ x: 0.2, y: 0.2 }],
        ],
        strokeWidth: 2,
        color: '#2e7263',
      }),
      annotationOf('image', { assetId: 'asset-1' }),
      annotationOf('text-edit', {
        text: 'Replacement',
        originalText: 'Original',
        fontSize: 12,
        color: '#000000',
        background: '#ffffff',
      }),
    ]);
    expect(result.getPageCount()).toBe(1);
  });

  it('bakes a text edit as a cover rect plus new text', async () => {
    const source = await makeSourcePdf(1);
    const coverOnly = await assemblePdf({
      pages: [
        plan('s', 0, {
          annotations: [
            annotationOf('text-edit', {
              text: '',
              originalText: 'Secret',
              fontSize: 12,
              color: '#000000',
              background: '#ffffff',
            }),
          ] as Annotation[],
        }),
      ],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    // An empty text-edit is a redaction: it still produces a valid one-page PDF.
    expect((await PDFDocument.load(coverOnly)).getPageCount()).toBe(1);

    const withText = await assemblePdf({
      pages: [
        plan('s', 0, {
          annotations: [
            annotationOf('text-edit', {
              text: 'Public',
              originalText: 'Secret',
              fontSize: 12,
              color: '#000000',
              background: '#ffffff',
            }),
          ] as Annotation[],
        }),
      ],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    // Drawing replacement text embeds Helvetica, growing the object count.
    const a = await PDFDocument.load(withText);
    const b = await PDFDocument.load(coverOnly);
    expect(a.context.enumerateIndirectObjects().length).toBeGreaterThan(
      b.context.enumerateIndirectObjects().length,
    );
  });

  it('embeds a Helvetica variant per styled rich text span', async () => {
    const plain = await bakeOne([
      annotationOf('rich-text', {
        blocks: [{ spans: [{ text: 'regular only' }] }],
        fontSize: 12,
        color: '#000000',
      }),
    ]);
    const styled = await bakeOne([
      annotationOf('rich-text', {
        blocks: [
          {
            spans: [
              { text: 'regular ' },
              { text: 'bold', bold: true },
              { text: 'italic', italic: true },
              { text: 'both', bold: true, italic: true },
            ],
          },
        ],
        fontSize: 12,
        color: '#000000',
      }),
    ]);
    expect(styled.getPageCount()).toBe(1);
    // Four variants embedded instead of one grows the object count.
    expect(styled.context.enumerateIndirectObjects().length).toBeGreaterThan(
      plain.context.enumerateIndirectObjects().length,
    );
  });

  it('bakes rich text on a rotated page without corrupting the document', async () => {
    const result = await bakeOne(
      [
        annotationOf('rich-text', {
          blocks: [{ spans: [{ text: 'rotated', bold: true, underline: true }] }],
          fontSize: 12,
          color: '#000000',
        }),
      ],
      90,
    );
    expect(result.getPageCount()).toBe(1);
  });

  it('grows the page content when baking (annotations actually land in the PDF)', async () => {
    const source = await makeSourcePdf(1);
    const emptyBytes = await assemblePdf({
      pages: [plan('s', 0)],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    const annotatedBytes = await assemblePdf({
      pages: [
        plan('s', 0, {
          annotations: [
            annotationOf('text', { text: 'Approved', fontSize: 20, color: '#2e7263' }),
            annotationOf('highlight', { color: '#ffd43b', opacity: 0.4 }),
          ] as Annotation[],
        }),
      ],
      sources: { s: source },
      assets: NO_ASSETS,
    });
    expect(annotatedBytes.length).toBeGreaterThan(emptyBytes.length);
    // The text bake embeds Helvetica as an additional font resource.
    const annotated = await PDFDocument.load(annotatedBytes);
    const emptyDoc = await PDFDocument.load(emptyBytes);
    expect(annotated.context.enumerateIndirectObjects().length).toBeGreaterThan(
      emptyDoc.context.enumerateIndirectObjects().length,
    );
  });

  it('replaces characters Helvetica cannot encode instead of failing', async () => {
    const result = await bakeOne([
      annotationOf('text', { text: 'Emoji 😀 and CJK 中文', fontSize: 12, color: '#000000' }),
    ]);
    expect(result.getPageCount()).toBe(1);
  });

  it('bakes annotations on rotated pages', async () => {
    const result = await bakeOne(
      [
        annotationOf('text', { text: 'Rotated', fontSize: 12, color: '#000000' }),
        annotationOf('image', { assetId: 'asset-1' }),
        annotationOf('shape', { shape: 'arrow', color: '#000000', strokeWidth: 2 }),
      ],
      90,
    );
    expect(result.getPage(0).getRotation().angle).toBe(90);
  });

  it('fails cleanly when an image asset is missing', async () => {
    const source = await makeSourcePdf(1);
    await expect(
      assemblePdf({
        pages: [plan('s', 0, { annotations: [annotationOf('image', { assetId: 'nope' })] })],
        sources: { s: source },
        assets: NO_ASSETS,
      }),
    ).rejects.toThrow(/image is missing/i);
  });
});

describe('assembleDocuments (split)', () => {
  it('produces one document per job from shared sources', async () => {
    const source = await makeSourcePdf(5);
    const documents = await assembleDocuments(
      [{ pages: [plan('s', 0), plan('s', 1)] }, { pages: [plan('s', 4)] }],
      { s: source },
      NO_ASSETS,
    );
    expect(documents).toHaveLength(2);
    expect((await PDFDocument.load(documents[0]!)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(documents[1]!)).getPageCount()).toBe(1);
  });

  it('reports progress across all jobs', async () => {
    const source = await makeSourcePdf(3);
    const totals = new Set<number>();
    let last = 0;
    await assembleDocuments(
      [{ pages: [plan('s', 0)] }, { pages: [plan('s', 1), plan('s', 2)] }],
      { s: source },
      NO_ASSETS,
      (done, total) => {
        totals.add(total);
        last = done;
      },
    );
    expect(totals).toEqual(new Set([3]));
    expect(last).toBe(3);
  });
});
