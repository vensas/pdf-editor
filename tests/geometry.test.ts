import { describe, expect, it } from 'vitest';
import {
  addRotations,
  clampRectToPage,
  displayRectToPdf,
  displayToPdfPoint,
  displayedSize,
  normalizeRotation,
  pdfToDisplayPoint,
} from '../src/pdf-core/geometry';
import type { Rotation } from '../src/pdf-core/types';

const W = 600;
const H = 800;

describe('normalizeRotation / addRotations', () => {
  it('normalizes negative and >=360 values', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('adds rotations modulo 360', () => {
    expect(addRotations(270, 90)).toBe(0);
    expect(addRotations(0, -90)).toBe(270);
    expect(addRotations(180, 180)).toBe(0);
  });
});

describe('displayedSize', () => {
  it('swaps dimensions for 90 and 270 degrees', () => {
    expect(displayedSize(W, H, 0)).toEqual({ width: W, height: H });
    expect(displayedSize(W, H, 90)).toEqual({ width: H, height: W });
    expect(displayedSize(W, H, 180)).toEqual({ width: W, height: H });
    expect(displayedSize(W, H, 270)).toEqual({ width: H, height: W });
  });
});

describe('displayToPdfPoint', () => {
  // These expectations mirror pdf.js's PageViewport transform: a point on the
  // rendered canvas must land on the same visual spot in the exported PDF.
  it('maps the display origin (top-left) to the correct pdf corner per rotation', () => {
    expect(displayToPdfPoint({ x: 0, y: 0 }, W, H, 0)).toEqual({ x: 0, y: H });
    expect(displayToPdfPoint({ x: 0, y: 0 }, W, H, 90)).toEqual({ x: 0, y: 0 });
    expect(displayToPdfPoint({ x: 0, y: 0 }, W, H, 180)).toEqual({ x: W, y: 0 });
    expect(displayToPdfPoint({ x: 0, y: 0 }, W, H, 270)).toEqual({ x: W, y: H });
  });

  it('maps interior points correctly for a 90° rotation', () => {
    // Displayed page is H wide, W tall. Point 10 from left, 20 from top.
    expect(displayToPdfPoint({ x: 10, y: 20 }, W, H, 90)).toEqual({ x: 20, y: 10 });
  });

  it('round-trips through pdfToDisplayPoint for every rotation', () => {
    const point = { x: 123.5, y: 456.25 };
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const pdf = displayToPdfPoint(point, W, H, rotation);
      expect(pdfToDisplayPoint(pdf, W, H, rotation)).toEqual(point);
    }
  });
});

describe('displayRectToPdf', () => {
  it('keeps axis-aligned rects axis-aligned with positive size', () => {
    const rect = { x: 50, y: 100, width: 200, height: 120 };
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const mapped = displayRectToPdf(rect, W, H, rotation);
      expect(mapped.width).toBeGreaterThan(0);
      expect(mapped.height).toBeGreaterThan(0);
      // Area is preserved by rigid transforms.
      expect(mapped.width * mapped.height).toBeCloseTo(rect.width * rect.height);
    }
  });

  it('maps a rect at rotation 0 to bottom-left origin coordinates', () => {
    const mapped = displayRectToPdf({ x: 50, y: 100, width: 200, height: 120 }, W, H, 0);
    expect(mapped).toEqual({ x: 50, y: H - 220, width: 200, height: 120 });
  });

  it('swaps width/height at 90°', () => {
    const mapped = displayRectToPdf({ x: 0, y: 0, width: 100, height: 40 }, W, H, 90);
    expect(mapped).toEqual({ x: 0, y: 0, width: 40, height: 100 });
  });
});

describe('clampRectToPage', () => {
  it('moves out-of-bounds rects back inside', () => {
    expect(clampRectToPage({ x: -10, y: -5, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    expect(clampRectToPage({ x: 80, y: 90, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
  });

  it('shrinks rects larger than the page', () => {
    expect(clampRectToPage({ x: 0, y: 0, width: 300, height: 50 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });
});
