/**
 * Pure geometry for turning pdf.js text-content items into editable text
 * runs in display space (PDF points, origin at the top-left of the page as
 * displayed, y growing down — the same space every annotation lives in).
 *
 * The pdf.js glue (fetching items and the page viewport) lives in
 * src/rendering; keeping the math here makes it unit-testable without a
 * browser.
 */

import type { Rect } from './types';

/** A 2-D affine transform as pdf.js represents it: [a, b, c, d, e, f]. */
export type Matrix = [number, number, number, number, number, number];

/** The subset of a pdf.js TextItem this module needs. */
export interface RawTextItem {
  str: string;
  /** Advance width in text space (device points at viewport scale 1). */
  width: number;
  height: number;
  /** Text-space -> unscaled space transform. */
  transform: number[];
}

/** One editable run of existing page text. */
export interface TextRun {
  text: string;
  /** Bounding box in display space. */
  rect: Rect;
  /** Approximate font size in points. */
  fontSize: number;
}

/**
 * Multiplies two affine transforms so that applying the result is the same
 * as applying `t` then `m` (m · t). Matches pdf.js's Util.transform.
 */
export function multiplyMatrix(m: Matrix, t: Matrix): Matrix {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

function isMatrix(value: number[]): value is Matrix {
  return value.length === 6 && value.every((n) => Number.isFinite(n));
}

/**
 * Converts one pdf.js text item into a display-space run, given the page's
 * viewport transform (from getViewport({ scale: 1, rotation })).
 *
 * Returns null for empty/whitespace runs and for rotated or mirrored text
 * (skew beyond a small threshold), which this first iteration does not edit.
 */
export function textItemToRun(item: RawTextItem, viewportTransform: number[]): TextRun | null {
  if (item.str.trim() === '') return null;
  if (!isMatrix(viewportTransform) || !isMatrix(item.transform)) return null;

  const tx = multiplyMatrix(viewportTransform, item.transform);
  const [a, b, c, d, x, baselineY] = tx;

  // Only horizontal, upright text for now: reject noticeable rotation/shear.
  const rotation = Math.atan2(b, a);
  if (Math.abs(rotation) > 0.02) return null;

  const fontHeight = Math.hypot(c, d);
  if (!(fontHeight > 0)) return null;

  const width = Math.abs(item.width);
  if (!(width > 0)) return null;

  // Baseline sits ~80% down the glyph box for Latin text; give a little
  // headroom above and a descent below so the cover fully hides the glyphs.
  const ascent = fontHeight * 0.8;
  const descent = fontHeight * 0.25;
  const rect: Rect = {
    x,
    y: baselineY - ascent,
    width,
    height: ascent + descent,
  };

  return { text: item.str, rect, fontSize: fontHeight };
}

/** Converts a list of raw items, dropping the ones that cannot be edited. */
export function textItemsToRuns(items: RawTextItem[], viewportTransform: number[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const item of items) {
    const run = textItemToRun(item, viewportTransform);
    if (run) runs.push(run);
  }
  return runs;
}
