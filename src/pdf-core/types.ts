/**
 * Type-safe domain models shared across the whole app.
 *
 * Everything here is plain data (structured-clone friendly) so the same
 * models flow unchanged between the UI, the editor store, and the export
 * Web Worker.
 */

export type SourceId = string;
export type PageId = string;
export type AnnotationId = string;
export type AssetId = string;

/** Clockwise rotation in degrees, the only values PDF supports. */
export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle. Coordinate system depends on context (see geometry.ts). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Static facts about one page of a loaded source PDF (from pdf.js). */
export interface SourcePageInfo {
  /** MediaBox size in PDF points, before any rotation. */
  width: number;
  height: number;
  /** The page's inherent /Rotate value. */
  rotate: Rotation;
}

/**
 * One page of the working document: a reference into a source PDF plus a
 * user-applied rotation delta. Reordering, deleting, and duplicating pages
 * are pure operations on arrays of these.
 */
export interface PageRef {
  id: PageId;
  sourceId: SourceId;
  /** Zero-based page index in the source document. */
  sourceIndex: number;
  /** User-applied rotation, clockwise, on top of the page's inherent rotation. */
  rotation: Rotation;
}

// --- Annotations -------------------------------------------------------------
//
// Annotation geometry lives in "display space": PDF points at scale 1, origin
// at the top-left of the page *as displayed* (inherent + user rotation applied),
// y growing downwards. geometry.ts converts to PDF user space at export time.

interface AnnotationBase {
  id: AnnotationId;
  pageId: PageId;
  /** Bounding box in display space. */
  rect: Rect;
}

export interface TextAnnotation extends AnnotationBase {
  kind: 'text';
  text: string;
  fontSize: number;
  /** #rrggbb */
  color: string;
}

/**
 * An in-place edit of the document's own text: the original glyphs under
 * `rect` are covered with `background` and `text` is drawn on top. This is
 * "real" text editing (it targets existing page text) as opposed to a text
 * box placed on empty space. `originalText` is kept for the editing UI only.
 */
export interface TextEditAnnotation extends AnnotationBase {
  kind: 'text-edit';
  text: string;
  originalText: string;
  fontSize: number;
  /** #rrggbb — the replacement text color. */
  color: string;
  /** #rrggbb — the fill used to cover the original glyphs. */
  background: string;
}

export interface InkAnnotation extends AnnotationBase {
  kind: 'ink';
  /**
   * Freehand stroke paths with points normalized to the bounding rect
   * (0..1 in both axes), so moving/resizing is a pure rect update.
   */
  paths: Point[][];
  strokeWidth: number;
  color: string;
}

export interface ImageAnnotation extends AnnotationBase {
  kind: 'image';
  /** Key into the editor's image asset store (PNG/JPEG bytes). */
  assetId: AssetId;
}

export interface HighlightAnnotation extends AnnotationBase {
  kind: 'highlight';
  color: string;
  /** 0..1 */
  opacity: number;
}

/**
 * Marks an existing page object (an image or form XObject drawn on the page)
 * for true removal: at export the matching draw operator is deleted from the
 * page's content stream, so the object is gone from the output — not covered.
 * `rect` is the object's bounding box in display space (used to match the draw
 * operator by placement); `label` describes it for the UI.
 */
export interface ObjectRemovalAnnotation extends AnnotationBase {
  kind: 'object-removal';
  label: string;
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'arrow';

export interface ShapeAnnotation extends AnnotationBase {
  kind: 'shape';
  shape: ShapeKind;
  color: string;
  strokeWidth: number;
  /** Fill for rectangle/ellipse; undefined = no fill. */
  fill?: string | undefined;
  /**
   * For line/arrow: by default the line runs from the rect's top-left to its
   * bottom-right; when true it runs from bottom-left to top-right.
   */
  mirrored?: boolean | undefined;
}

export type Annotation =
  | TextAnnotation
  | TextEditAnnotation
  | ObjectRemovalAnnotation
  | InkAnnotation
  | ImageAnnotation
  | HighlightAnnotation
  | ShapeAnnotation;

export type AnnotationKind = Annotation['kind'];

export interface ImageAsset {
  id: AssetId;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  /** Natural pixel size, used for initial placement aspect ratio. */
  width: number;
  height: number;
}

// --- Export ------------------------------------------------------------------

/** Everything the assembler needs to produce one page of the output PDF. */
export interface PagePlanItem {
  sourceId: SourceId;
  sourceIndex: number;
  /** User rotation delta (the inherent rotation is read from the source). */
  rotation: Rotation;
  annotations: Annotation[];
}

/** Self-contained input for building one output PDF (main thread or worker). */
export interface AssembleInput {
  pages: PagePlanItem[];
  /** Raw bytes of every source referenced by `pages`. */
  sources: Record<SourceId, Uint8Array>;
  /** Image assets referenced by image annotations. */
  assets: Record<AssetId, { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array }>;
}
