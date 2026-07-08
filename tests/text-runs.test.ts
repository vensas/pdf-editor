import { describe, expect, it } from 'vitest';
import {
  multiplyMatrix,
  textItemToRun,
  textItemsToRuns,
  type Matrix,
  type RawTextItem,
} from '../src/pdf-core/text-runs';

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

describe('multiplyMatrix', () => {
  it('is the identity when multiplying by identity', () => {
    const m: Matrix = [2, 0, 0, 3, 5, 7];
    expect(multiplyMatrix(IDENTITY, m)).toEqual(m);
    expect(multiplyMatrix(m, IDENTITY)).toEqual(m);
  });

  it('composes translation after scaling (m · t)', () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const translate: Matrix = [1, 0, 0, 1, 10, 20];
    // Apply translate then scale: point (1,1) -> (11,21) -> (22,42).
    const composed = multiplyMatrix(scale, translate);
    expect(composed).toEqual([2, 0, 0, 2, 20, 40]);
  });
});

describe('textItemToRun', () => {
  // A pdf.js viewport at scale 1 flips the y axis: [1, 0, 0, -1, 0, pageHeight].
  const viewport: number[] = [1, 0, 0, -1, 0, 800];

  function item(
    str: string,
    x: number,
    baselinePdfY: number,
    size: number,
    width: number,
  ): RawTextItem {
    // Text item transform places `size`-tall upright text at (x, baselineY).
    return { str, width, height: size, transform: [size, 0, 0, size, x, baselinePdfY] };
  }

  it('maps an upright run into a display-space rect on the baseline', () => {
    const run = textItemToRun(item('Hello', 100, 700, 12, 40), viewport);
    expect(run).not.toBeNull();
    expect(run!.text).toBe('Hello');
    expect(run!.fontSize).toBeCloseTo(12);
    expect(run!.rect.width).toBeCloseTo(40);
    // Baseline is at display y = 800 - 700 = 100; box top is above it.
    const baselineDisplayY = 100;
    expect(run!.rect.y).toBeLessThan(baselineDisplayY);
    expect(run!.rect.y + run!.rect.height).toBeGreaterThan(baselineDisplayY);
    expect(run!.rect.x).toBeCloseTo(100);
  });

  it('rejects empty or whitespace runs', () => {
    expect(textItemToRun(item('', 0, 0, 12, 10), viewport)).toBeNull();
    expect(textItemToRun(item('   ', 0, 0, 12, 10), viewport)).toBeNull();
  });

  it('rejects zero-width runs', () => {
    expect(textItemToRun(item('x', 0, 0, 12, 0), viewport)).toBeNull();
  });

  it('rejects rotated text', () => {
    const rotated: RawTextItem = {
      str: 'tilt',
      width: 30,
      height: 12,
      // 30-degree rotation in the transform.
      transform: [10.39, 6, -6, 10.39, 50, 500],
    };
    expect(textItemToRun(rotated, viewport)).toBeNull();
  });

  it('rejects malformed transforms', () => {
    expect(
      textItemToRun({ str: 'x', width: 10, height: 12, transform: [1, 2, 3] }, viewport),
    ).toBeNull();
  });

  it('filters undesirable runs in textItemsToRuns', () => {
    const runs = textItemsToRuns(
      [item('keep', 0, 700, 12, 20), item('  ', 0, 700, 12, 20), item('also', 0, 680, 12, 20)],
      viewport,
    );
    expect(runs.map((r) => r.text)).toEqual(['keep', 'also']);
  });
});
