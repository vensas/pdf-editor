/**
 * Coordinate math between "display space" and PDF user space.
 *
 * Display space is what the editor works in: PDF points at scale 1, origin at
 * the top-left of the page as shown on screen (all rotation applied), y down.
 * PDF user space is what pdf-lib draws in: origin bottom-left of the
 * *unrotated* page, y up.
 *
 * The mappings mirror pdf.js's PageViewport transform exactly, so a point
 * picked on a rendered canvas lands on the same spot in the exported PDF.
 */

import type { Point, Rect, Rotation } from './types';

export function normalizeRotation(degrees: number): Rotation {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  // PDF rotations are always multiples of 90; snap defensively.
  return ((Math.round(normalized / 90) * 90) % 360) as Rotation;
}

export function addRotations(a: Rotation, b: Rotation | number): Rotation {
  return normalizeRotation(a + b);
}

/** Size of the page as displayed: 90°/270° swap width and height. */
export function displayedSize(
  pageWidth: number,
  pageHeight: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: pageHeight, height: pageWidth }
    : { width: pageWidth, height: pageHeight };
}

/**
 * Maps a display-space point to PDF user space.
 * pageWidth/pageHeight are the *unrotated* MediaBox dimensions;
 * rotation is the total displayed rotation (inherent + user).
 */
export function displayToPdfPoint(
  point: Point,
  pageWidth: number,
  pageHeight: number,
  rotation: Rotation,
): Point {
  switch (rotation) {
    case 0:
      return { x: point.x, y: pageHeight - point.y };
    case 90:
      return { x: point.y, y: point.x };
    case 180:
      return { x: pageWidth - point.x, y: point.y };
    case 270:
      return { x: pageWidth - point.y, y: pageHeight - point.x };
  }
}

/** Inverse of displayToPdfPoint. */
export function pdfToDisplayPoint(
  point: Point,
  pageWidth: number,
  pageHeight: number,
  rotation: Rotation,
): Point {
  switch (rotation) {
    case 0:
      return { x: point.x, y: pageHeight - point.y };
    case 90:
      return { x: point.y, y: point.x };
    case 180:
      return { x: pageWidth - point.x, y: point.y };
    case 270:
      return { x: pageHeight - point.y, y: pageWidth - point.x };
  }
}

/**
 * Maps an axis-aligned display rect to the axis-aligned PDF rect covering the
 * same area. (Rotations are multiples of 90°, so axis-aligned stays axis-aligned.)
 */
export function displayRectToPdf(
  rect: Rect,
  pageWidth: number,
  pageHeight: number,
  rotation: Rotation,
): Rect {
  const a = displayToPdfPoint({ x: rect.x, y: rect.y }, pageWidth, pageHeight, rotation);
  const b = displayToPdfPoint(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    pageWidth,
    pageHeight,
    rotation,
  );
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Clamps a rect to the displayed page bounds, preserving size where possible. */
export function clampRectToPage(rect: Rect, displayWidth: number, displayHeight: number): Rect {
  const width = Math.min(rect.width, displayWidth);
  const height = Math.min(rect.height, displayHeight);
  const x = Math.min(Math.max(rect.x, 0), displayWidth - width);
  const y = Math.min(Math.max(rect.y, 0), displayHeight - height);
  return { x, y, width, height };
}
