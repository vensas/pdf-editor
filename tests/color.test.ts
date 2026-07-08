import { describe, expect, it } from 'vitest';
import { dominantColor, rgbToHex } from '../src/pdf-core/color';

describe('rgbToHex', () => {
  it('formats and clamps channels', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080');
    expect(rgbToHex({ r: -5, g: 300, b: 16 })).toBe('#00ff10');
  });
});

describe('dominantColor', () => {
  it('returns the fallback for no samples', () => {
    expect(dominantColor([])).toBe('#ffffff');
    expect(dominantColor([], '#000000')).toBe('#000000');
  });

  it('picks the most common color', () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(dominantColor([white, white, white, black])).toBe('#ffffff');
  });

  it('snaps near-identical shades into one bucket', () => {
    // Three near-whites (anti-aliasing noise) outvote one distinct color.
    const near = [
      { r: 254, g: 255, b: 253 },
      { r: 255, g: 254, b: 255 },
      { r: 253, g: 255, b: 254 },
      { r: 10, g: 20, b: 30 },
    ];
    const result = dominantColor(near);
    // Averaged near-white, comfortably light.
    expect(parseInt(result.slice(1, 3), 16)).toBeGreaterThan(240);
  });
});
