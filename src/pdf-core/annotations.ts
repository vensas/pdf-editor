/**
 * Pure helpers for creating, transforming, and (de)serializing annotations.
 * Serialization is versioned and validating, so persisted or transferred
 * annotation data can never smuggle malformed shapes into the editor.
 */

import type {
  Annotation,
  AnnotationId,
  PageId,
  Point,
  Rect,
  RichTextBlock,
  RichTextSpan,
  ShapeKind,
} from './types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function moveAnnotation<A extends Annotation>(annotation: A, dx: number, dy: number): A {
  return {
    ...annotation,
    rect: { ...annotation.rect, x: annotation.rect.x + dx, y: annotation.rect.y + dy },
  };
}

/** Resizing only touches the rect: ink paths are normalized, images scale. */
export function resizeAnnotation<A extends Annotation>(annotation: A, rect: Rect): A {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return { ...annotation, rect: { ...rect, width, height } };
}

/**
 * Converts absolute display-space stroke paths into a bounding rect plus
 * rect-normalized points (0..1), the storage format of ink annotations.
 */
export function normalizeInkPaths(paths: Point[][]): { rect: Rect; paths: Point[][] } {
  const all = paths.flat();
  if (all.length === 0) {
    return { rect: { x: 0, y: 0, width: 1, height: 1 }, paths: [] };
  }
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxX = Math.max(...all.map((p) => p.x));
  const maxY = Math.max(...all.map((p) => p.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return {
    rect: { x: minX, y: minY, width, height },
    paths: paths.map((path) =>
      path.map((p) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height })),
    ),
  };
}

/** Maps rect-normalized ink points back to absolute display space. */
export function denormalizeInkPath(path: readonly Point[], rect: Rect): Point[] {
  return path.map((p) => ({ x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height }));
}

// --- Serialization -----------------------------------------------------------

export const ANNOTATION_SCHEMA_VERSION = 1;

export interface SerializedAnnotations {
  version: number;
  annotations: Annotation[];
}

export function serializeAnnotations(annotations: readonly Annotation[]): string {
  const payload: SerializedAnnotations = {
    version: ANNOTATION_SCHEMA_VERSION,
    annotations: [...annotations],
  };
  return JSON.stringify(payload);
}

export function deserializeAnnotations(json: string): Annotation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Annotation data is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed['version'] !== ANNOTATION_SCHEMA_VERSION) {
    throw new Error('Unsupported annotation data version.');
  }
  const list = parsed['annotations'];
  if (!Array.isArray(list)) {
    throw new Error('Annotation data is malformed.');
  }
  return list.map(parseAnnotation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRect(value: unknown): Rect {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value['x']) ||
    !isFiniteNumber(value['y']) ||
    !isFiniteNumber(value['width']) ||
    !isFiniteNumber(value['height'])
  ) {
    throw new Error('Annotation rect is malformed.');
  }
  return { x: value['x'], y: value['y'], width: value['width'], height: value['height'] };
}

function parsePoint(value: unknown): Point {
  if (!isRecord(value) || !isFiniteNumber(value['x']) || !isFiniteNumber(value['y'])) {
    throw new Error('Annotation point is malformed.');
  }
  return { x: value['x'], y: value['y'] };
}

function parseColor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`Annotation ${field} must be a #rrggbb color.`);
  }
  return value;
}

function parseRichTextBlock(value: unknown): RichTextBlock {
  if (!isRecord(value) || !Array.isArray(value['spans'])) {
    throw new Error('Rich text block is malformed.');
  }
  return {
    spans: value['spans'].map((span: unknown): RichTextSpan => {
      if (!isRecord(span) || typeof span['text'] !== 'string') {
        throw new Error('Rich text span is malformed.');
      }
      return {
        text: span['text'],
        bold: span['bold'] === true ? true : undefined,
        italic: span['italic'] === true ? true : undefined,
        underline: span['underline'] === true ? true : undefined,
        strike: span['strike'] === true ? true : undefined,
      };
    }),
  };
}

const SHAPE_KINDS: readonly ShapeKind[] = ['rectangle', 'ellipse', 'line', 'arrow'];

export function parseAnnotation(value: unknown): Annotation {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['pageId'] !== 'string') {
    throw new Error('Annotation is malformed.');
  }
  const id = value['id'] as AnnotationId;
  const pageId = value['pageId'] as PageId;
  const rect = parseRect(value['rect']);

  switch (value['kind']) {
    case 'text': {
      if (typeof value['text'] !== 'string' || !isFiniteNumber(value['fontSize'])) {
        throw new Error('Text annotation is malformed.');
      }
      return {
        kind: 'text',
        id,
        pageId,
        rect,
        text: value['text'],
        fontSize: value['fontSize'],
        color: parseColor(value['color'], 'color'),
      };
    }
    case 'rich-text': {
      if (!Array.isArray(value['blocks']) || !isFiniteNumber(value['fontSize'])) {
        throw new Error('Rich text annotation is malformed.');
      }
      return {
        kind: 'rich-text',
        id,
        pageId,
        rect,
        blocks: value['blocks'].map(parseRichTextBlock),
        fontSize: value['fontSize'],
        color: parseColor(value['color'], 'color'),
      };
    }
    case 'text-edit': {
      if (
        typeof value['text'] !== 'string' ||
        typeof value['originalText'] !== 'string' ||
        !isFiniteNumber(value['fontSize'])
      ) {
        throw new Error('Text-edit annotation is malformed.');
      }
      return {
        kind: 'text-edit',
        id,
        pageId,
        rect,
        text: value['text'],
        originalText: value['originalText'],
        fontSize: value['fontSize'],
        color: parseColor(value['color'], 'color'),
        background: parseColor(value['background'], 'background'),
      };
    }
    case 'ink': {
      if (!Array.isArray(value['paths']) || !isFiniteNumber(value['strokeWidth'])) {
        throw new Error('Ink annotation is malformed.');
      }
      return {
        kind: 'ink',
        id,
        pageId,
        rect,
        paths: value['paths'].map((path: unknown) => {
          if (!Array.isArray(path)) throw new Error('Ink annotation is malformed.');
          return path.map(parsePoint);
        }),
        strokeWidth: value['strokeWidth'],
        color: parseColor(value['color'], 'color'),
      };
    }
    case 'object-removal': {
      if (typeof value['label'] !== 'string') {
        throw new Error('Object-removal annotation is malformed.');
      }
      return { kind: 'object-removal', id, pageId, rect, label: value['label'] };
    }
    case 'image': {
      if (typeof value['assetId'] !== 'string') {
        throw new Error('Image annotation is malformed.');
      }
      return { kind: 'image', id, pageId, rect, assetId: value['assetId'] };
    }
    case 'highlight': {
      const opacity = value['opacity'];
      if (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1) {
        throw new Error('Highlight annotation is malformed.');
      }
      return {
        kind: 'highlight',
        id,
        pageId,
        rect,
        color: parseColor(value['color'], 'color'),
        opacity,
      };
    }
    case 'shape': {
      const shape = value['shape'];
      if (typeof shape !== 'string' || !SHAPE_KINDS.includes(shape as ShapeKind)) {
        throw new Error('Shape annotation is malformed.');
      }
      if (!isFiniteNumber(value['strokeWidth'])) {
        throw new Error('Shape annotation is malformed.');
      }
      return {
        kind: 'shape',
        id,
        pageId,
        rect,
        shape: shape as ShapeKind,
        color: parseColor(value['color'], 'color'),
        strokeWidth: value['strokeWidth'],
        fill:
          value['fill'] === undefined || value['fill'] === null
            ? undefined
            : parseColor(value['fill'], 'fill'),
        mirrored: value['mirrored'] === true ? true : undefined,
      };
    }
    default:
      throw new Error('Unknown annotation kind.');
  }
}

/** Endpoints of a line/arrow shape in display space. */
export function lineEndpoints(rect: Rect, mirrored: boolean): { start: Point; end: Point } {
  return mirrored
    ? {
        start: { x: rect.x, y: rect.y + rect.height },
        end: { x: rect.x + rect.width, y: rect.y },
      }
    : {
        start: { x: rect.x, y: rect.y },
        end: { x: rect.x + rect.width, y: rect.y + rect.height },
      };
}
