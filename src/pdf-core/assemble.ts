/**
 * Builds output PDFs from a page plan with pdf-lib: page copying across any
 * number of sources (merge), rotation baking, and flattening annotations into
 * real page content. Runs unchanged on the main thread, in a Web Worker, and
 * in node (tests).
 *
 * Extract, split, and merge are all just page plans, so this one code path
 * covers every export the app offers.
 */

import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  degrees,
  rgb,
  type RGB,
} from 'pdf-lib';
import { denormalizeInkPath, lineEndpoints } from './annotations';
import { classifyPdfError, PdfError } from './errors';
import { displayToPdfPoint, displayRectToPdf, normalizeRotation } from './geometry';
import { removePageObjects } from './page-xobjects';
import { TEXT_ASCENT_FACTOR, TEXT_PADDING, textLineHeight } from './text-metrics';
import type {
  Annotation,
  AssembleInput,
  AssetId,
  ImageAnnotation,
  PagePlanItem,
  Point,
  Rect,
  RichTextAnnotation,
  Rotation,
  SourceId,
  TextAnnotation,
  TextEditAnnotation,
} from './types';

/** Baseline position within a replaced text run, as a fraction of the box. */
const TEXT_EDIT_ASCENT_FACTOR = 0.8;

export interface AssembleProgress {
  (pagesDone: number, totalPages: number): void;
}

/** One output document per job; jobs share loaded sources and assets. */
export interface AssembleJob {
  pages: PagePlanItem[];
}

export async function assemblePdf(
  input: AssembleInput,
  onProgress?: AssembleProgress,
): Promise<Uint8Array> {
  const [bytes] = await assembleDocuments(
    [{ pages: input.pages }],
    input.sources,
    input.assets,
    onProgress,
  );
  if (!bytes) throw new PdfError('export-failed');
  return bytes;
}

export async function assembleDocuments(
  jobs: AssembleJob[],
  sources: Record<SourceId, Uint8Array>,
  assets: AssembleInput['assets'],
  onProgress?: AssembleProgress,
): Promise<Uint8Array[]> {
  const totalPages = jobs.reduce((sum, job) => sum + job.pages.length, 0);
  if (totalPages === 0) {
    throw new PdfError('export-failed', 'Select at least one page.');
  }

  const loadedSources = new Map<SourceId, PDFDocument>();
  const results: Uint8Array[] = [];
  let pagesDone = 0;

  for (const job of jobs) {
    const target = await PDFDocument.create();
    target.setProducer('vensas PDF Editor');
    target.setCreator('vensas PDF Editor — https://pdf-editor.apps.vensas.de/');

    const resources = new DrawResources(target, assets);
    const copied = await copyJobPages(target, job.pages, sources, loadedSources);

    for (const [index, item] of job.pages.entries()) {
      const page = copied[index];
      if (!page) throw new PdfError('export-failed');
      target.addPage(page);

      const inherent = normalizeRotation(page.getRotation().angle);
      const total = normalizeRotation(inherent + item.rotation);
      page.setRotation(degrees(total));

      // Object removals edit the page content stream (true removal); do them
      // before drawing so a removed logo can't sit above a new annotation.
      const removals = item.annotations.filter((a) => a.kind === 'object-removal');
      if (removals.length > 0) {
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const targets = removals.map((r) => displayRectToPdf(r.rect, pageWidth, pageHeight, total));
        removePageObjects(page, targets);
      }

      for (const annotation of item.annotations) {
        if (annotation.kind === 'object-removal') continue;
        await bakeAnnotation(page, annotation, total, resources);
      }

      pagesDone += 1;
      onProgress?.(pagesDone, totalPages);
    }

    results.push(await target.save());
  }
  return results;
}

/**
 * Copies all needed source pages into the target with one copyPages() call
 * per source, and returns them aligned with the job's plan order.
 */
async function copyJobPages(
  target: PDFDocument,
  items: PagePlanItem[],
  sources: Record<SourceId, Uint8Array>,
  loadedSources: Map<SourceId, PDFDocument>,
): Promise<PDFPage[]> {
  const bySource = new Map<SourceId, number[]>();
  for (const item of items) {
    const list = bySource.get(item.sourceId) ?? [];
    list.push(item.sourceIndex);
    bySource.set(item.sourceId, list);
  }

  const queues = new Map<SourceId, PDFPage[]>();
  for (const [sourceId, indices] of bySource) {
    const source = await loadSource(sourceId, sources, loadedSources);
    const pageCount = source.getPageCount();
    for (const index of indices) {
      if (index < 0 || index >= pageCount) {
        throw new PdfError(
          'export-failed',
          `Page ${index + 1} is out of range — the document has ${pageCount} pages.`,
        );
      }
    }
    queues.set(sourceId, await target.copyPages(source, indices));
  }

  return items.map((item) => {
    const page = queues.get(item.sourceId)?.shift();
    if (!page) throw new PdfError('export-failed');
    return page;
  });
}

async function loadSource(
  sourceId: SourceId,
  sources: Record<SourceId, Uint8Array>,
  cache: Map<SourceId, PDFDocument>,
): Promise<PDFDocument> {
  const cached = cache.get(sourceId);
  if (cached) return cached;
  const bytes = sources[sourceId];
  if (!bytes) {
    throw new PdfError('export-failed', 'A source document is missing.');
  }
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    cache.set(sourceId, doc);
    return doc;
  } catch (error) {
    throw classifyPdfError(error, 'corrupt');
  }
}

// --- Drawing -----------------------------------------------------------------

/** The Helvetica variant matching a rich text span's bold/italic flags. */
type FontVariant = 'regular' | 'bold' | 'oblique' | 'bold-oblique';

const VARIANT_FONTS: Record<FontVariant, StandardFonts> = {
  regular: StandardFonts.Helvetica,
  bold: StandardFonts.HelveticaBold,
  oblique: StandardFonts.HelveticaOblique,
  'bold-oblique': StandardFonts.HelveticaBoldOblique,
};

function spanVariant(span: { bold?: boolean | undefined; italic?: boolean | undefined }) {
  if (span.bold && span.italic) return 'bold-oblique' as const;
  if (span.bold) return 'bold' as const;
  if (span.italic) return 'oblique' as const;
  return 'regular' as const;
}

/** Lazily created, per-target-document pdf-lib resources (fonts, images). */
class DrawResources {
  private readonly fonts = new Map<FontVariant, PDFFont>();
  private readonly images = new Map<AssetId, PDFImage>();
  private readonly encodable = new Map<string, boolean>();

  constructor(
    private readonly target: PDFDocument,
    private readonly assets: AssembleInput['assets'],
  ) {}

  async getFont(variant: FontVariant = 'regular'): Promise<PDFFont> {
    const cached = this.fonts.get(variant);
    if (cached) return cached;
    const font = await this.target.embedFont(VARIANT_FONTS[variant]);
    this.fonts.set(variant, font);
    return font;
  }

  async getImage(assetId: AssetId): Promise<PDFImage> {
    const cached = this.images.get(assetId);
    if (cached) return cached;
    const asset = this.assets[assetId];
    if (!asset) throw new PdfError('export-failed', 'An annotation image is missing.');
    const image =
      asset.mime === 'image/png'
        ? await this.target.embedPng(asset.bytes)
        : await this.target.embedJpg(asset.bytes);
    this.images.set(assetId, image);
    return image;
  }

  /** Replaces characters Helvetica/WinAnsi cannot encode with "?". */
  sanitize(font: PDFFont, text: string): string {
    let out = '';
    for (const ch of text) {
      let ok = this.encodable.get(ch);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        this.encodable.set(ch, ok);
      }
      out += ok ? ch : '?';
    }
    return out;
  }
}

function hexToRgb(hex: string): RGB {
  const value = parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
}

async function bakeAnnotation(
  page: PDFPage,
  annotation: Annotation,
  rotation: Rotation,
  resources: DrawResources,
): Promise<void> {
  // getSize() reports the unrotated MediaBox, which is exactly what the
  // geometry mapping expects.
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const toPdf = (point: Point): Point => displayToPdfPoint(point, pageWidth, pageHeight, rotation);
  const rectToPdf = (rect: typeof annotation.rect) =>
    displayRectToPdf(rect, pageWidth, pageHeight, rotation);

  switch (annotation.kind) {
    case 'highlight': {
      const rect = rectToPdf(annotation.rect);
      page.drawRectangle({
        ...rect,
        color: hexToRgb(annotation.color),
        opacity: annotation.opacity,
        blendMode: BlendMode.Multiply,
      });
      return;
    }

    case 'shape': {
      const color = hexToRgb(annotation.color);
      const { strokeWidth } = annotation;
      if (annotation.shape === 'rectangle' || annotation.shape === 'ellipse') {
        const rect = rectToPdf(annotation.rect);
        const fill = annotation.fill ? hexToRgb(annotation.fill) : undefined;
        if (annotation.shape === 'rectangle') {
          page.drawRectangle({
            ...rect,
            borderColor: color,
            borderWidth: strokeWidth,
            ...(fill ? { color: fill } : {}),
          });
        } else {
          page.drawEllipse({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            xScale: Math.max(rect.width / 2 - strokeWidth / 2, 1),
            yScale: Math.max(rect.height / 2 - strokeWidth / 2, 1),
            borderColor: color,
            borderWidth: strokeWidth,
            ...(fill ? { color: fill } : {}),
          });
        }
        return;
      }

      // line / arrow
      const { start, end } = lineEndpoints(annotation.rect, annotation.mirrored === true);
      const pdfStart = toPdf(start);
      const pdfEnd = toPdf(end);
      page.drawLine({
        start: pdfStart,
        end: pdfEnd,
        thickness: strokeWidth,
        color,
        lineCap: LineCapStyle.Round,
      });
      if (annotation.shape === 'arrow') {
        for (const head of arrowHeadSegments(pdfStart, pdfEnd, strokeWidth)) {
          page.drawLine({ ...head, thickness: strokeWidth, color, lineCap: LineCapStyle.Round });
        }
      }
      return;
    }

    case 'ink': {
      const color = hexToRgb(annotation.color);
      for (const path of annotation.paths) {
        const points = denormalizeInkPath(path, annotation.rect).map(toPdf);
        const first = points[0];
        if (!first) continue;
        if (points.length === 1) {
          page.drawCircle({ x: first.x, y: first.y, size: annotation.strokeWidth / 2, color });
          continue;
        }
        for (let i = 0; i < points.length - 1; i++) {
          page.drawLine({
            start: points[i]!,
            end: points[i + 1]!,
            thickness: annotation.strokeWidth,
            color,
            lineCap: LineCapStyle.Round,
          });
        }
      }
      return;
    }

    case 'image':
      return bakeImage(page, annotation, rotation, toPdf, resources);

    case 'text':
      return bakeText(page, annotation, rotation, toPdf, resources);

    case 'rich-text':
      return bakeRichText(page, annotation, rotation, toPdf, resources);

    case 'text-edit':
      return bakeTextEdit(page, annotation, rotation, toPdf, rectToPdf, resources);

    case 'object-removal':
      // Applied as a content-stream edit before drawing, not drawn here.
      return;
  }
}

async function bakeImage(
  page: PDFPage,
  annotation: ImageAnnotation,
  rotation: Rotation,
  toPdf: (p: Point) => Point,
  resources: DrawResources,
): Promise<void> {
  const image = await resources.getImage(annotation.assetId);
  const { rect } = annotation;
  // drawImage rotates around its (x, y) anchor, which is the image's own
  // bottom-left corner — in display space that's (rect.x, rect.y + height).
  const anchor = toPdf({ x: rect.x, y: rect.y + rect.height });
  page.drawImage(image, {
    x: anchor.x,
    y: anchor.y,
    width: rect.width,
    height: rect.height,
    rotate: degrees(rotation),
  });
}

async function bakeText(
  page: PDFPage,
  annotation: TextAnnotation,
  rotation: Rotation,
  toPdf: (p: Point) => Point,
  resources: DrawResources,
): Promise<void> {
  const font = await resources.getFont();
  const { rect, fontSize } = annotation;
  const color = hexToRgb(annotation.color);
  const lineHeight = textLineHeight(fontSize);
  const lines = resources.sanitize(font, annotation.text).split('\n');

  lines.forEach((line, index) => {
    if (line === '') return;
    // Baseline anchor for this line, in display space.
    const baseline = toPdf({
      x: rect.x + TEXT_PADDING,
      y: rect.y + TEXT_PADDING + fontSize * TEXT_ASCENT_FACTOR + index * lineHeight,
    });
    page.drawText(line, {
      x: baseline.x,
      y: baseline.y,
      size: fontSize,
      font,
      color,
      rotate: degrees(rotation),
    });
  });
}

/**
 * Bakes a rich text box: each block is one line; spans advance along the
 * line using the metrics of their Helvetica variant, and underline/strike
 * decorations are drawn as thin lines relative to the baseline.
 */
async function bakeRichText(
  page: PDFPage,
  annotation: RichTextAnnotation,
  rotation: Rotation,
  toPdf: (p: Point) => Point,
  resources: DrawResources,
): Promise<void> {
  const { rect, fontSize } = annotation;
  const color = hexToRgb(annotation.color);
  const lineHeight = textLineHeight(fontSize);
  const decorationThickness = Math.max(fontSize / 16, 0.6);

  for (const [lineIndex, block] of annotation.blocks.entries()) {
    // Baseline of this line, in display space.
    const baselineY =
      rect.y + TEXT_PADDING + fontSize * TEXT_ASCENT_FACTOR + lineIndex * lineHeight;
    let advanceX = rect.x + TEXT_PADDING;

    for (const span of block.spans) {
      const font = await resources.getFont(spanVariant(span));
      const text = resources.sanitize(font, span.text);
      if (text === '') continue;
      const width = font.widthOfTextAtSize(text, fontSize);
      const baseline = toPdf({ x: advanceX, y: baselineY });
      page.drawText(text, {
        x: baseline.x,
        y: baseline.y,
        size: fontSize,
        font,
        color,
        rotate: degrees(rotation),
      });

      const decorations: number[] = [];
      if (span.underline) decorations.push(baselineY + fontSize * 0.12);
      if (span.strike) decorations.push(baselineY - fontSize * 0.28);
      for (const y of decorations) {
        page.drawLine({
          start: toPdf({ x: advanceX, y }),
          end: toPdf({ x: advanceX + width, y }),
          thickness: decorationThickness,
          color,
        });
      }

      advanceX += width;
    }
  }
}

/**
 * Bakes an in-place text edit: cover the original glyphs with the sampled
 * background color, then draw the replacement text on the original baseline.
 */
async function bakeTextEdit(
  page: PDFPage,
  annotation: TextEditAnnotation,
  rotation: Rotation,
  toPdf: (p: Point) => Point,
  rectToPdf: (rect: Rect) => Rect,
  resources: DrawResources,
): Promise<void> {
  page.drawRectangle({ ...rectToPdf(annotation.rect), color: hexToRgb(annotation.background) });

  if (annotation.text.trim() === '') return; // deletion: cover only

  const font = await resources.getFont();
  const { rect, fontSize } = annotation;
  const color = hexToRgb(annotation.color);
  const lineHeight = textLineHeight(fontSize);
  const lines = resources.sanitize(font, annotation.text).split('\n');

  lines.forEach((line, index) => {
    if (line === '') return;
    const baseline = toPdf({
      x: rect.x,
      y: rect.y + fontSize * TEXT_EDIT_ASCENT_FACTOR + index * lineHeight,
    });
    page.drawText(line, {
      x: baseline.x,
      y: baseline.y,
      size: fontSize,
      font,
      color,
      rotate: degrees(rotation),
    });
  });
}

function arrowHeadSegments(
  start: Point,
  end: Point,
  strokeWidth: number,
): { start: Point; end: Point }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return [];
  const headLength = Math.min(Math.max(4 * strokeWidth + 6, 8), length * 0.4);
  const angle = Math.atan2(dy, dx);
  const spread = Math.PI / 6;
  return [1, -1].map((side) => ({
    start: end,
    end: {
      x: end.x - headLength * Math.cos(angle + side * spread),
      y: end.y - headLength * Math.sin(angle + side * spread),
    },
  }));
}
