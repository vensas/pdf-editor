import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_SCHEMA_VERSION,
  denormalizeInkPath,
  deserializeAnnotations,
  isValidHexColor,
  lineEndpoints,
  moveAnnotation,
  normalizeInkPaths,
  resizeAnnotation,
  serializeAnnotations,
} from '../src/pdf-core/annotations';
import type { Annotation } from '../src/pdf-core/types';

const rect = { x: 10, y: 20, width: 100, height: 50 };

const samples: Annotation[] = [
  {
    kind: 'text',
    id: 't1',
    pageId: 'p1',
    rect,
    text: 'Hello\nWorld',
    fontSize: 16,
    color: '#1a2030',
  },
  {
    kind: 'rich-text',
    id: 'rt1',
    pageId: 'p1',
    rect,
    blocks: [
      { spans: [{ text: 'plain ' }, { text: 'bold', bold: true }] },
      { spans: [] },
      { spans: [{ text: 'mixed', italic: true, underline: true, strike: true }] },
    ],
    fontSize: 14,
    color: '#1a2030',
  },
  {
    kind: 'text-edit',
    id: 'te1',
    pageId: 'p1',
    rect,
    text: 'New text',
    originalText: 'Old text',
    fontSize: 12,
    color: '#1a2030',
    background: '#ffffff',
  },
  {
    kind: 'ink',
    id: 'i1',
    pageId: 'p1',
    rect,
    paths: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ],
    strokeWidth: 2.5,
    color: '#2e7263',
  },
  { kind: 'image', id: 'img1', pageId: 'p2', rect, assetId: 'asset-1' },
  { kind: 'highlight', id: 'h1', pageId: 'p1', rect, color: '#ffd43b', opacity: 0.45 },
  {
    kind: 'shape',
    id: 's1',
    pageId: 'p1',
    rect,
    shape: 'arrow',
    color: '#c2372e',
    strokeWidth: 3,
    mirrored: true,
  },
  {
    kind: 'shape',
    id: 's2',
    pageId: 'p2',
    rect,
    shape: 'rectangle',
    color: '#c2372e',
    strokeWidth: 1,
    fill: '#ffffff',
  },
];

describe('serialization round-trip', () => {
  it('preserves every annotation kind exactly', () => {
    const json = serializeAnnotations(samples);
    const restored = deserializeAnnotations(json);
    // `mirrored`/`fill` normalize undefined to explicit values, so compare
    // through JSON to ignore undefined-vs-absent differences.
    expect(JSON.parse(JSON.stringify(restored))).toEqual(JSON.parse(JSON.stringify(samples)));
  });

  it('embeds the schema version', () => {
    const parsed = JSON.parse(serializeAnnotations([])) as { version: number };
    expect(parsed.version).toBe(ANNOTATION_SCHEMA_VERSION);
  });
});

describe('deserialization validation', () => {
  it('rejects non-JSON input', () => {
    expect(() => deserializeAnnotations('not json')).toThrow(/not valid JSON/i);
  });

  it('rejects wrong versions', () => {
    expect(() => deserializeAnnotations(JSON.stringify({ version: 99, annotations: [] }))).toThrow(
      /version/i,
    );
  });

  it('rejects malformed rects', () => {
    const bad = {
      version: 1,
      annotations: [
        {
          kind: 'highlight',
          id: 'x',
          pageId: 'p',
          rect: { x: 'NaN' },
          color: '#ffffff',
          opacity: 0.5,
        },
      ],
    };
    expect(() => deserializeAnnotations(JSON.stringify(bad))).toThrow(/rect/i);
  });

  it('rejects bad colors', () => {
    const bad = {
      version: 1,
      annotations: [{ kind: 'highlight', id: 'x', pageId: 'p', rect, color: 'red', opacity: 0.5 }],
    };
    expect(() => deserializeAnnotations(JSON.stringify(bad))).toThrow(/#rrggbb/i);
  });

  it('rejects out-of-range opacity', () => {
    const bad = {
      version: 1,
      annotations: [
        { kind: 'highlight', id: 'x', pageId: 'p', rect, color: '#ffffff', opacity: 2 },
      ],
    };
    expect(() => deserializeAnnotations(JSON.stringify(bad))).toThrow(/highlight/i);
  });

  it('rejects unknown kinds and shapes', () => {
    expect(() =>
      deserializeAnnotations(
        JSON.stringify({ version: 1, annotations: [{ kind: 'wat', id: 'x', pageId: 'p', rect }] }),
      ),
    ).toThrow(/unknown annotation kind/i);
    expect(() =>
      deserializeAnnotations(
        JSON.stringify({
          version: 1,
          annotations: [
            {
              kind: 'shape',
              id: 'x',
              pageId: 'p',
              rect,
              shape: 'star',
              color: '#ffffff',
              strokeWidth: 1,
            },
          ],
        }),
      ),
    ).toThrow(/shape/i);
  });

  it('rejects malformed rich text blocks and spans', () => {
    const base = { kind: 'rich-text', id: 'rt', pageId: 'p', rect, fontSize: 12, color: '#000000' };
    for (const blocks of ['nope', [{ spans: 'nope' }], [{ spans: [{ text: 42 }] }]]) {
      const json = JSON.stringify({
        version: ANNOTATION_SCHEMA_VERSION,
        annotations: [{ ...base, blocks }],
      });
      expect(() => deserializeAnnotations(json)).toThrow();
    }
  });

  it('rejects a text-edit missing its cover background', () => {
    const bad = {
      version: 1,
      annotations: [
        {
          kind: 'text-edit',
          id: 'x',
          pageId: 'p',
          rect,
          text: 'a',
          originalText: 'b',
          fontSize: 12,
          color: '#000000',
          // background missing
        },
      ],
    };
    expect(() => deserializeAnnotations(JSON.stringify(bad))).toThrow(/background/i);
  });
});

describe('move / resize', () => {
  it('moves only the rect', () => {
    const moved = moveAnnotation(samples[0]!, 5, -10);
    expect(moved.rect).toEqual({ x: 15, y: 10, width: 100, height: 50 });
    expect(samples[0]!.rect).toEqual(rect);
  });

  it('resize enforces a minimum size', () => {
    const resized = resizeAnnotation(samples[0]!, { x: 0, y: 0, width: -50, height: 0 });
    expect(resized.rect.width).toBeGreaterThanOrEqual(1);
    expect(resized.rect.height).toBeGreaterThanOrEqual(1);
  });
});

describe('ink normalization', () => {
  it('normalizes absolute points into the bounding rect', () => {
    const { rect: box, paths } = normalizeInkPaths([
      [
        { x: 10, y: 20 },
        { x: 110, y: 70 },
      ],
    ]);
    expect(box).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(paths[0]![0]).toEqual({ x: 0, y: 0 });
    expect(paths[0]![1]).toEqual({ x: 1, y: 1 });
  });

  it('round-trips through denormalizeInkPath', () => {
    const original = [
      { x: 10, y: 20 },
      { x: 60, y: 45 },
      { x: 110, y: 70 },
    ];
    const { rect: box, paths } = normalizeInkPaths([original]);
    const restored = denormalizeInkPath(paths[0]!, box);
    for (const [index, point] of restored.entries()) {
      expect(point.x).toBeCloseTo(original[index]!.x);
      expect(point.y).toBeCloseTo(original[index]!.y);
    }
  });

  it('handles empty input', () => {
    expect(normalizeInkPaths([]).paths).toEqual([]);
  });
});

describe('lineEndpoints', () => {
  it('runs top-left to bottom-right by default', () => {
    expect(lineEndpoints(rect, false)).toEqual({
      start: { x: 10, y: 20 },
      end: { x: 110, y: 70 },
    });
  });

  it('runs bottom-left to top-right when mirrored', () => {
    expect(lineEndpoints(rect, true)).toEqual({
      start: { x: 10, y: 70 },
      end: { x: 110, y: 20 },
    });
  });
});

describe('isValidHexColor', () => {
  it('accepts #rrggbb and rejects everything else', () => {
    expect(isValidHexColor('#a1B2c3')).toBe(true);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
  });
});
