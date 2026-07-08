import { describe, expect, it } from 'vitest';
import {
  listXObjectDraws,
  paintedBBox,
  removeXObjectDraws,
  type Matrix6,
  type XObjectInfo,
} from '../src/pdf-core/content-stream';

const IMG: Record<string, XObjectInfo> = { Im0: { type: 'image' } };

describe('paintedBBox', () => {
  it('maps the unit square through the CTM for an image', () => {
    // Scale 190x58, translate (347, 726).
    const ctm: Matrix6 = [190, 0, 0, 58, 347, 726];
    expect(paintedBBox(ctm, { type: 'image' })).toEqual({
      x: 347,
      y: 726,
      width: 190,
      height: 58,
    });
  });

  it('uses the form BBox and matrix for a form', () => {
    const ctm: Matrix6 = [1, 0, 0, 1, 100, 200];
    const info: XObjectInfo = { type: 'form', bbox: [0, 0, 50, 20], matrix: [1, 0, 0, 1, 0, 0] };
    expect(paintedBBox(ctm, info)).toEqual({ x: 100, y: 200, width: 50, height: 20 });
  });
});

describe('listXObjectDraws', () => {
  it('lists each XObject draw with its painted box', () => {
    const content = 'q 190 0 0 58 347 726 cm /Im0 Do Q';
    const draws = listXObjectDraws(content, IMG);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ name: 'Im0', type: 'image' });
    expect(draws[0]!.rect).toEqual({ x: 347, y: 726, width: 190, height: 58 });
  });

  it('tracks the CTM stack across q/Q', () => {
    const content = 'q 2 0 0 2 0 0 cm q 10 0 0 10 5 5 cm /Im0 Do Q Q';
    // Outer scale 2, inner scale 10 translate (5,5): combined maps unit square
    // to 20x20 at (10,10).
    expect(listXObjectDraws(content, IMG)[0]!.rect).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it('ignores unknown names and non-Do operators', () => {
    expect(listXObjectDraws('/Unknown Do 1 2 3 re f', IMG)).toHaveLength(0);
  });
});

describe('removeXObjectDraws', () => {
  const content = 'q 190 0 0 58 347 726 cm /Im0 Do Q\nq 20 0 0 20 5 5 cm /Im0 Do Q';

  it('blanks only the draw whose box matches the target', () => {
    const target = { x: 347, y: 726, width: 190, height: 58 };
    const result = removeXObjectDraws(content, [target], IMG);
    expect(result.removed).toBe(1);
    // The matched Do is gone; byte length is preserved (blanked with spaces).
    expect(result.content.length).toBe(content.length);
    expect(listXObjectDraws(result.content, IMG)).toHaveLength(1);
    expect(listXObjectDraws(result.content, IMG)[0]!.rect).toMatchObject({ x: 5, y: 5 });
  });

  it('removes multiple matches and reports the count', () => {
    const result = removeXObjectDraws(
      content,
      [
        { x: 347, y: 726, width: 190, height: 58 },
        { x: 5, y: 5, width: 20, height: 20 },
      ],
      IMG,
    );
    expect(result.removed).toBe(2);
    expect(listXObjectDraws(result.content, IMG)).toHaveLength(0);
  });

  it('returns the content unchanged when nothing matches', () => {
    const result = removeXObjectDraws(content, [{ x: 0, y: 0, width: 1, height: 1 }], IMG);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(content);
  });

  it('respects the match tolerance', () => {
    const target = { x: 348, y: 727, width: 191, height: 59 }; // ~1pt off
    expect(removeXObjectDraws(content, [target], IMG, 2).removed).toBe(1);
    expect(removeXObjectDraws(content, [target], IMG, 0.5).removed).toBe(0);
  });

  it('does not choke on strings, hex, and inline images', () => {
    const tricky =
      '(a )( Do fake) Tj <48656c6c6f> q 10 0 0 10 0 0 cm /Im0 Do Q BI /W 2 /H 2 ID \x00\x01\x02\x03 EI';
    const result = removeXObjectDraws(tricky, [{ x: 0, y: 0, width: 10, height: 10 }], IMG);
    expect(result.removed).toBe(1);
  });
});
