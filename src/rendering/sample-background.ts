/**
 * Estimates the page-background color around a text run by reading pixels
 * from the already-rendered page canvas — used to cover the original glyphs
 * when a text edit is baked in. Browser-only (needs a 2D canvas context).
 */

import { dominantColor, type Rgb } from '../pdf-core/color';
import type { Rect } from '../pdf-core/types';

/**
 * @param canvas   the rendered page canvas
 * @param rect     the run's bounding box in display space (points at scale 1)
 * @param scale    canvas pixels per display point (canvas.width / displayWidth)
 */
export function sampleBackgroundColor(
  canvas: HTMLCanvasElement,
  rect: Rect,
  scale: number,
): string {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '#ffffff';

  const midY = (rect.y + rect.height / 2) * scale;
  const gap = Math.max(2, rect.height * scale * 0.4);
  // Probe just outside the glyphs (left/right of the run) and in the margins
  // above/below, where the background is most likely undisturbed.
  const probes: [number, number][] = [
    [rect.x * scale - gap, midY],
    [(rect.x + rect.width) * scale + gap, midY],
    [(rect.x + rect.width / 2) * scale, rect.y * scale - gap],
    [(rect.x + rect.width / 2) * scale, (rect.y + rect.height) * scale + gap],
  ];

  const pixels: Rgb[] = [];
  for (const [px, py] of probes) {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
    try {
      const data = context.getImageData(x, y, 1, 1).data;
      pixels.push({ r: data[0]!, g: data[1]!, b: data[2]! });
    } catch {
      // getImageData throws on a tainted canvas; ignore and fall back.
    }
  }

  return dominantColor(pixels);
}
