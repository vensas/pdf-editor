/**
 * Small pure color helpers, kept separate so the text-edit background
 * sampling logic can be unit-tested without a canvas.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Picks the most common color among sampled pixels, snapping near-identical
 * shades together so anti-aliasing noise doesn't split the vote. Returns
 * white when there is nothing to sample. This is a good estimate of a solid
 * page background; over images/gradients it is only approximate (the user
 * can correct the cover color afterwards).
 */
export function dominantColor(pixels: readonly Rgb[], fallback = '#ffffff'): string {
  if (pixels.length === 0) return fallback;

  const buckets = new Map<string, { count: number; sum: Rgb }>();
  for (const px of pixels) {
    // Quantize to 16 levels per channel for bucketing.
    const key = `${px.r >> 4}:${px.g >> 4}:${px.b >> 4}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.sum.r += px.r;
      bucket.sum.g += px.g;
      bucket.sum.b += px.b;
    } else {
      buckets.set(key, { count: 1, sum: { ...px } });
    }
  }

  let best: { count: number; sum: Rgb } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return fallback;
  return rgbToHex({
    r: best.sum.r / best.count,
    g: best.sum.g / best.count,
    b: best.sum.b / best.count,
  });
}
