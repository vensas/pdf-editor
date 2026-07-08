/**
 * Shared text layout constants so the on-screen text annotation overlay and
 * the pdf-lib bake produce (near-)identical output. All values are in display
 * points relative to the annotation's font size.
 */

export const TEXT_PADDING = 4;
export const TEXT_LINE_HEIGHT_FACTOR = 1.25;
/** Approximate Helvetica ascent as a fraction of the font size. */
export const TEXT_ASCENT_FACTOR = 0.75;

export function textLineHeight(fontSize: number): number {
  return fontSize * TEXT_LINE_HEIGHT_FACTOR;
}

/** Minimum rect height needed to show `lineCount` lines at `fontSize`. */
export function textBoxHeight(fontSize: number, lineCount: number): number {
  return Math.max(1, lineCount) * textLineHeight(fontSize) + 2 * TEXT_PADDING;
}
