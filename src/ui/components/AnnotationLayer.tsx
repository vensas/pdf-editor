/**
 * Interactive SVG overlay on top of the rendered page. Handles creating,
 * selecting, moving, and resizing annotations, plus inline text editing.
 *
 * All geometry is in display space (PDF points at scale 1); the SVG viewBox
 * does the zoom scaling, so pointer coordinates only need one division.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { denormalizeInkPath, lineEndpoints, normalizeInkPaths } from '../../pdf-core/annotations';
import { clampRectToPage } from '../../pdf-core/geometry';
import {
  TEXT_ASCENT_FACTOR,
  TEXT_PADDING,
  textBoxHeight,
  textLineHeight,
} from '../../pdf-core/text-metrics';
import type { TextRun } from '../../pdf-core/text-runs';
import type { Annotation, ImageAsset, PageRef, Point, Rect } from '../../pdf-core/types';
import { selectActiveDocument, useEditorStore } from '../../editor-state/store';
import { EMPTY_DOC } from '../../editor-state/types';
import type { DocSnapshot, Tool } from '../../editor-state/types';
import { renderService } from '../../rendering/render-service';
import { useActiveDoc } from '../hooks/useActiveDoc';
import { assetUrl } from '../asset-urls';

export interface AnnotationLayerProps {
  page: PageRef;
  /** Displayed page size at scale 1, in PDF points. */
  displayWidth: number;
  displayHeight: number;
  /** CSS pixels per display point. */
  zoom: number;
  /** Estimates the page-background color under a display-space rect. */
  sampleBackground: (rect: Rect) => string;
}

interface Draft {
  tool: Tool;
  start: Point;
  current: Point;
  /** Ink only: every point of the stroke. */
  points: Point[];
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface Interaction {
  mode: 'move' | 'resize';
  id: string;
  corner: Corner;
  pointerStart: Point;
  startRect: Rect;
  before: DocSnapshot;
}

const DEFAULT_COLORS: Partial<Record<Tool, string>> = {
  text: '#1a2030',
  ink: '#2e7263',
  highlight: '#ffd43b',
  rectangle: '#c2372e',
  ellipse: '#c2372e',
  line: '#1a2030',
  arrow: '#c2372e',
};

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_STROKE = 2.5;
const MIN_DRAG = 5;
// Must match TEXT_EDIT_ASCENT_FACTOR in pdf-core/assemble.ts so the on-screen
// preview and the baked output place the replacement text identically.
const TEXT_EDIT_ASCENT_FACTOR = 0.8;

export function AnnotationLayer({
  page,
  displayWidth,
  displayHeight,
  zoom,
  sampleBackground,
}: AnnotationLayerProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const textEditBefore = useRef<DocSnapshot | null>(null);

  // Select the stable annotations record and derive the page's list in
  // render — selecting a freshly filtered array would loop the store hook.
  const allAnnotations =
    useActiveDoc((docState) => docState.doc.annotations) ?? EMPTY_DOC.annotations;
  const annotations = useMemo(
    () => Object.values(allAnnotations).filter((a) => a.pageId === page.id),
    [allAnnotations, page.id],
  );
  const assets = useEditorStore((state) => state.assets);
  const tool = useEditorStore((state) => state.tool);
  const activeAnnotationId = useActiveDoc((docState) => docState.activeAnnotationId) ?? null;
  const addAnnotation = useEditorStore((state) => state.addAnnotation);
  const updateAnnotation = useEditorStore((state) => state.updateAnnotation);
  const setActiveAnnotation = useEditorStore((state) => state.setActiveAnnotation);
  const commitSnapshot = useEditorStore((state) => state.commitSnapshot);

  const toDisplay = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const bounds = svgRef.current?.getBoundingClientRect();
      if (!bounds) return { x: 0, y: 0 };
      return {
        x: Math.min(Math.max((event.clientX - bounds.left) / zoom, 0), displayWidth),
        y: Math.min(Math.max((event.clientY - bounds.top) / zoom, 0), displayHeight),
      };
    },
    [zoom, displayWidth, displayHeight],
  );

  // --- Creation --------------------------------------------------------------

  const finishDraft = useCallback(
    (endedDraft: Draft) => {
      const { tool: draftTool, start, current, points } = endedDraft;
      const id = crypto.randomUUID();
      const color = DEFAULT_COLORS[draftTool] ?? '#1a2030';

      if (draftTool === 'ink') {
        if (points.length < 2) return;
        const { rect, paths } = normalizeInkPaths([points]);
        addAnnotation({
          kind: 'ink',
          id,
          pageId: page.id,
          rect,
          paths,
          strokeWidth: DEFAULT_STROKE,
          color,
        });
        return;
      }

      const rect: Rect = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      };

      if (draftTool === 'line' || draftTool === 'arrow') {
        if (Math.hypot(rect.width, rect.height) < MIN_DRAG) return;
        addAnnotation({
          kind: 'shape',
          id,
          pageId: page.id,
          rect: { ...rect, width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) },
          shape: draftTool,
          color,
          strokeWidth: DEFAULT_STROKE,
          mirrored: (current.x - start.x) * (current.y - start.y) < 0,
        });
        return;
      }

      if (rect.width < MIN_DRAG || rect.height < MIN_DRAG) return;

      if (draftTool === 'erase') {
        // Erase = cover the region with the sampled page background. Reuses
        // the text-edit primitive (empty text bakes as cover-only), so it is
        // movable, resizable, recolorable, and undoable like any annotation.
        addAnnotation({
          kind: 'text-edit',
          id,
          pageId: page.id,
          rect,
          text: '',
          originalText: '',
          fontSize: DEFAULT_FONT_SIZE,
          color: '#1a2030',
          background: sampleBackground(rect),
        });
        return;
      }

      if (draftTool === 'highlight') {
        addAnnotation({ kind: 'highlight', id, pageId: page.id, rect, color, opacity: 0.45 });
      } else if (draftTool === 'rectangle' || draftTool === 'ellipse') {
        addAnnotation({
          kind: 'shape',
          id,
          pageId: page.id,
          rect,
          shape: draftTool,
          color,
          strokeWidth: DEFAULT_STROKE,
        });
      }
    },
    [addAnnotation, page.id, sampleBackground],
  );

  // --- Edit existing text (edit-text tool) -----------------------------------

  const startTextEdit = useCallback(
    (run: TextRun) => {
      const id = crypto.randomUUID();
      addAnnotation({
        kind: 'text-edit',
        id,
        pageId: page.id,
        rect: run.rect,
        text: run.text,
        originalText: run.text,
        fontSize: run.fontSize,
        color: '#1a2030',
        background: sampleBackground(run.rect),
      });
      textEditBefore.current = null; // creation already recorded in history
      setEditingTextId(id);
    },
    [addAnnotation, page.id, sampleBackground],
  );

  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (tool === 'select') {
        setActiveAnnotation(null);
        return;
      }
      // image = placed via the toolbar picker; edit-text = via run hotspots.
      if (tool === 'image' || tool === 'edit-text') return;
      const point = toDisplay(event);

      if (tool === 'text') {
        // Prevent the pointerdown's default focus handling: it would run
        // AFTER the editor textarea mounts and auto-focuses, blur it, and
        // the empty-text cleanup would instantly delete the new annotation.
        event.preventDefault();
        const height = textBoxHeight(DEFAULT_FONT_SIZE, 1);
        const rect = clampRectToPage(
          { x: point.x, y: point.y, width: 220, height },
          displayWidth,
          displayHeight,
        );
        const id = crypto.randomUUID();
        addAnnotation({
          kind: 'text',
          id,
          pageId: page.id,
          rect,
          text: '',
          fontSize: DEFAULT_FONT_SIZE,
          color: DEFAULT_COLORS.text!,
        });
        textEditBefore.current = null; // creation already recorded in history
        setEditingTextId(id);
        return;
      }

      // Suppress native drag/text-selection side effects while drawing.
      event.preventDefault();
      capturePointer(event.currentTarget as Element, event.pointerId);
      setDraft({ tool, start: point, current: point, points: [point] });
    },
    [tool, toDisplay, setActiveAnnotation, addAnnotation, page.id, displayWidth, displayHeight],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const point = toDisplay(event);

      const active = interaction.current;
      if (active) {
        const dx = point.x - active.pointerStart.x;
        const dy = point.y - active.pointerStart.y;
        const next =
          active.mode === 'move'
            ? clampRectToPage(
                { ...active.startRect, x: active.startRect.x + dx, y: active.startRect.y + dy },
                displayWidth,
                displayHeight,
              )
            : resizeRect(active.startRect, active.corner, dx, dy);
        updateAnnotation(active.id, { rect: next }, { transient: true });
        return;
      }

      if (draft) {
        setDraft((current) =>
          current ? { ...current, current: point, points: [...current.points, point] } : current,
        );
      }
    },
    [draft, toDisplay, updateAnnotation, displayWidth, displayHeight],
  );

  const handlePointerUp = useCallback(() => {
    const active = interaction.current;
    if (active) {
      interaction.current = null;
      commitSnapshot(active.before);
      return;
    }
    if (draft) {
      setDraft(null);
      finishDraft(draft);
    }
  }, [draft, finishDraft, commitSnapshot]);

  // --- Select / move / resize --------------------------------------------------

  const beginMove = useCallback(
    (event: React.PointerEvent, annotation: Annotation) => {
      if (tool !== 'select' || event.button !== 0) return;
      event.stopPropagation();
      setActiveAnnotation(annotation.id);
      capturePointer(svgRef.current, event.pointerId);
      interaction.current = {
        mode: 'move',
        id: annotation.id,
        corner: 'se',
        pointerStart: toDisplay(event),
        startRect: annotation.rect,
        before: activeDocSnapshot(),
      };
    },
    [tool, setActiveAnnotation, toDisplay],
  );

  const beginResize = useCallback(
    (event: React.PointerEvent, annotation: Annotation, corner: Corner) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      capturePointer(svgRef.current, event.pointerId);
      interaction.current = {
        mode: 'resize',
        id: annotation.id,
        corner,
        pointerStart: toDisplay(event),
        startRect: annotation.rect,
        before: activeDocSnapshot(),
      };
    },
    [toDisplay],
  );

  // --- Inline text editing -----------------------------------------------------

  const editingAnnotation = annotations.find(
    (annotation) =>
      annotation.id === editingTextId &&
      (annotation.kind === 'text' || annotation.kind === 'text-edit'),
  ) as Extract<Annotation, { kind: 'text' | 'text-edit' }> | undefined;

  const stopTextEditing = useCallback(() => {
    if (!editingAnnotation) {
      setEditingTextId(null);
      return;
    }
    const before = textEditBefore.current;
    textEditBefore.current = null;
    setEditingTextId(null);
    // An empty *text box* is noise and gets dropped; an empty *text edit*
    // is meaningful (it deletes the original text under its cover).
    if (editingAnnotation.kind === 'text' && editingAnnotation.text.trim() === '') {
      useEditorStore.getState().deleteAnnotation(editingAnnotation.id);
      return;
    }
    if (before) commitSnapshot(before);
  }, [editingAnnotation, commitSnapshot]);

  // A stale editingTextId (annotation deleted while editing) is harmless: the
  // textarea only renders while a matching annotation exists.

  // Focus the inline editor once the browser has finished the click's own
  // focus handling — autoFocus alone can be blurred right back by it.
  useEffect(() => {
    if (!editingTextId) return undefined;
    const raf = requestAnimationFrame(() => textEditorRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [editingTextId]);

  const activeAnnotation = annotations.find((a) => a.id === activeAnnotationId);

  return (
    <div
      className="annotation-layer"
      data-tool={tool}
      style={{ width: displayWidth * zoom, height: displayHeight * zoom }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${displayWidth} ${displayHeight}`}
        width={displayWidth * zoom}
        height={displayHeight * zoom}
        role="img"
        aria-label="Annotations"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {annotations.map((annotation) => (
          <g
            key={annotation.id}
            className={`annotation ${annotation.id === activeAnnotationId ? 'is-active' : ''}`}
            onPointerDown={(event) => beginMove(event, annotation)}
            onDoubleClick={() => {
              if (annotation.kind === 'text' || annotation.kind === 'text-edit') {
                textEditBefore.current = activeDocSnapshot();
                setEditingTextId(annotation.id);
              }
            }}
          >
            <AnnotationShape
              annotation={annotation}
              assets={assets}
              hideText={annotation.id === editingTextId}
            />
          </g>
        ))}

        {tool === 'edit-text' && (
          <TextRunHotspots
            key={`${page.id}:${page.rotation}`}
            page={page}
            displayHeight={displayHeight}
            onPick={startTextEdit}
          />
        )}

        {draft && <DraftShape draft={draft} />}

        {activeAnnotation && tool === 'select' && (
          <SelectionOutline
            rect={activeAnnotation.rect}
            zoom={zoom}
            onResizeStart={(event, corner) => beginResize(event, activeAnnotation, corner)}
          />
        )}
      </svg>

      {editingAnnotation && (
        <textarea
          ref={textEditorRef}
          className="text-annotation-editor"
          value={editingAnnotation.text}
          placeholder="Type here…"
          autoFocus
          style={{
            left: editingAnnotation.rect.x * zoom,
            top: editingAnnotation.rect.y * zoom,
            width: editingAnnotation.rect.width * zoom,
            height: editingAnnotation.rect.height * zoom,
            fontSize: editingAnnotation.fontSize * zoom,
            lineHeight: `${textLineHeight(editingAnnotation.fontSize) * zoom}px`,
            // A text edit sits directly on the covered glyphs (no padding) and
            // shows its cover color so the replacement previews in place.
            padding: (editingAnnotation.kind === 'text-edit' ? 0 : TEXT_PADDING) * zoom,
            color: editingAnnotation.color,
            ...(editingAnnotation.kind === 'text-edit'
              ? { background: editingAnnotation.background }
              : {}),
          }}
          onChange={(event) => {
            const text = event.target.value;
            const lines = text.split('\n').length;
            updateAnnotation(
              editingAnnotation.id,
              {
                text,
                rect: {
                  ...editingAnnotation.rect,
                  height: Math.max(
                    editingAnnotation.rect.height,
                    textBoxHeight(editingAnnotation.fontSize, lines),
                  ),
                },
              },
              { transient: true },
            );
          }}
          onBlur={stopTextEditing}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              stopTextEditing();
            }
          }}
        />
      )}
    </div>
  );
}

// --- Presentational pieces -----------------------------------------------------

function AnnotationShape({
  annotation,
  assets,
  hideText,
}: {
  annotation: Annotation;
  assets: Record<string, ImageAsset>;
  hideText: boolean;
}): JSX.Element | null {
  const { rect } = annotation;
  switch (annotation.kind) {
    case 'highlight':
      return (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={annotation.color}
          opacity={annotation.opacity}
          style={{ mixBlendMode: 'multiply' }}
        />
      );
    case 'shape': {
      if (annotation.shape === 'rectangle') {
        return (
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={annotation.fill ?? 'transparent'}
            fillOpacity={annotation.fill ? 1 : 0}
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
          />
        );
      }
      if (annotation.shape === 'ellipse') {
        return (
          <ellipse
            cx={rect.x + rect.width / 2}
            cy={rect.y + rect.height / 2}
            rx={rect.width / 2}
            ry={rect.height / 2}
            fill={annotation.fill ?? 'transparent'}
            fillOpacity={annotation.fill ? 1 : 0}
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
          />
        );
      }
      const { start, end } = lineEndpoints(rect, annotation.mirrored === true);
      return (
        <g stroke={annotation.color} strokeWidth={annotation.strokeWidth} strokeLinecap="round">
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
          {annotation.shape === 'arrow' &&
            arrowHeads(start, end, annotation.strokeWidth).map((segment, index) => (
              <line
                key={index}
                x1={segment.start.x}
                y1={segment.start.y}
                x2={segment.end.x}
                y2={segment.end.y}
              />
            ))}
          {/* invisible fat hit area so thin lines are selectable */}
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="transparent"
            strokeWidth={Math.max(annotation.strokeWidth, 12)}
          />
        </g>
      );
    }
    case 'ink':
      return (
        <g
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          {annotation.paths.map((path, index) => (
            <path key={index} d={pathData(denormalizeInkPath(path, rect))} />
          ))}
        </g>
      );
    case 'image': {
      const asset = assets[annotation.assetId];
      if (!asset) return null;
      return (
        <image
          href={assetUrl(asset)}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          preserveAspectRatio="none"
        />
      );
    }
    case 'text': {
      if (hideText) return null;
      const lineHeight = textLineHeight(annotation.fontSize);
      return (
        <g>
          {/* subtle hit/selection area */}
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="transparent"
            className="text-hit-area"
          />
          {annotation.text.split('\n').map((line, index) => (
            <text
              key={index}
              x={rect.x + TEXT_PADDING}
              y={
                rect.y +
                TEXT_PADDING +
                annotation.fontSize * TEXT_ASCENT_FACTOR +
                index * lineHeight
              }
              fontSize={annotation.fontSize}
              fontFamily="Helvetica, Arial, sans-serif"
              fill={annotation.color}
            >
              {line}
            </text>
          ))}
        </g>
      );
    }
    case 'text-edit': {
      const lineHeight = textLineHeight(annotation.fontSize);
      return (
        <g>
          {/* cover the original glyphs with the sampled background color */}
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={annotation.background}
          />
          {!hideText &&
            annotation.text.split('\n').map((line, index) => (
              <text
                key={index}
                x={rect.x}
                y={rect.y + annotation.fontSize * TEXT_EDIT_ASCENT_FACTOR + index * lineHeight}
                fontSize={annotation.fontSize}
                fontFamily="Helvetica, Arial, sans-serif"
                fill={annotation.color}
              >
                {line}
              </text>
            ))}
        </g>
      );
    }
  }
}

/**
 * Clickable overlay of the page's detected text runs, shown while the
 * edit-text tool is active. Clicking a run starts an in-place text edit.
 */
function TextRunHotspots({
  page,
  displayHeight,
  onPick,
}: {
  page: PageRef;
  displayHeight: number;
  onPick: (run: TextRun) => void;
}): JSX.Element | null {
  // Reset per page via the remount key at the call site, so the effect never
  // has to clear state synchronously (React Compiler forbids that).
  const [runs, setRuns] = useState<TextRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    void renderService.textRuns(page.sourceId, page.sourceIndex, page.rotation).then((result) => {
      if (!cancelled) setRuns(result);
    });
    return () => {
      cancelled = true;
    };
  }, [page.sourceId, page.sourceIndex, page.rotation]);

  return (
    <g className="text-run-hotspots">
      {runs.map((run, index) => (
        <rect
          key={index}
          className="text-run-hotspot"
          x={run.rect.x}
          y={run.rect.y}
          width={run.rect.width}
          height={run.rect.height}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            onPick(run);
          }}
        >
          <title>Edit “{run.text}”</title>
        </rect>
      ))}
      {runs.length === 0 && (
        <text x={8} y={displayHeight - 8} className="text-run-empty" fontSize={11}>
          No selectable text found on this page.
        </text>
      )}
    </g>
  );
}

function DraftShape({ draft }: { draft: Draft }): JSX.Element | null {
  const { tool, start, current, points } = draft;
  const color = DEFAULT_COLORS[tool] ?? '#1a2030';
  const rect: Rect = {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
  switch (tool) {
    case 'ink':
      return (
        <path
          d={pathData(points)}
          stroke={color}
          strokeWidth={DEFAULT_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'highlight':
      return <rect {...rect} fill={color} opacity={0.45} style={{ mixBlendMode: 'multiply' }} />;
    case 'erase':
      // The real cover color is sampled on release; preview with a neutral
      // dashed box so the user sees the region being wiped.
      return (
        <rect
          {...rect}
          fill="#ffffff"
          fillOpacity={0.75}
          stroke="#66646f"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      );
    case 'rectangle':
      return <rect {...rect} fill="none" stroke={color} strokeWidth={DEFAULT_STROKE} />;
    case 'ellipse':
      return (
        <ellipse
          cx={rect.x + rect.width / 2}
          cy={rect.y + rect.height / 2}
          rx={rect.width / 2}
          ry={rect.height / 2}
          fill="none"
          stroke={color}
          strokeWidth={DEFAULT_STROKE}
        />
      );
    case 'line':
    case 'arrow':
      return (
        <g stroke={color} strokeWidth={DEFAULT_STROKE} strokeLinecap="round">
          <line x1={start.x} y1={start.y} x2={current.x} y2={current.y} />
          {tool === 'arrow' &&
            arrowHeads(start, current, DEFAULT_STROKE).map((segment, index) => (
              <line
                key={index}
                x1={segment.start.x}
                y1={segment.start.y}
                x2={segment.end.x}
                y2={segment.end.y}
              />
            ))}
        </g>
      );
    default:
      return null;
  }
}

function SelectionOutline({
  rect,
  zoom,
  onResizeStart,
}: {
  rect: Rect;
  zoom: number;
  onResizeStart(event: React.PointerEvent, corner: Corner): void;
}): JSX.Element {
  const handleSize = 9 / zoom;
  const corners: { corner: Corner; x: number; y: number }[] = [
    { corner: 'nw', x: rect.x, y: rect.y },
    { corner: 'ne', x: rect.x + rect.width, y: rect.y },
    { corner: 'sw', x: rect.x, y: rect.y + rect.height },
    { corner: 'se', x: rect.x + rect.width, y: rect.y + rect.height },
  ];
  return (
    <g className="selection-outline">
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="none"
        strokeWidth={1.5 / zoom}
        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
      />
      {corners.map(({ corner, x, y }) => (
        <rect
          key={corner}
          className={`resize-handle handle-${corner}`}
          x={x - handleSize / 2}
          y={y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          onPointerDown={(event) => onResizeStart(event, corner)}
        />
      ))}
    </g>
  );
}

/** Snapshot of the active document, for gesture-scoped undo commits. */
function activeDocSnapshot(): DocSnapshot {
  return selectActiveDocument(useEditorStore.getState())?.doc ?? EMPTY_DOC;
}

// --- Pure helpers ----------------------------------------------------------------

/** Captures the pointer where supported (jsdom/SVG in tests may lack it). */
function capturePointer(element: Element | null, pointerId: number): void {
  if (element && typeof element.setPointerCapture === 'function') {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Ignore: capture is a best-effort UX nicety, not required for drawing.
    }
  }
}

function pathData(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first!.x} ${first!.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}

function arrowHeads(start: Point, end: Point, strokeWidth: number): { start: Point; end: Point }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return [];
  const headLength = Math.min(Math.max(4 * strokeWidth + 6, 8), length * 0.4);
  const angle = Math.atan2(dy, dx);
  const spread = Math.PI / 6;
  return [1, -1].map((side) => ({
    start: end,
    end: {
      x: end.x - headLength * Math.cos(angle + side * spread),
      y: end.y - headLength * Math.sin(angle + side * spread),
    },
  }));
}

function resizeRect(start: Rect, corner: Corner, dx: number, dy: number): Rect {
  const MIN = 8;
  let { x, y, width, height } = start;
  if (corner === 'nw' || corner === 'sw') {
    const newX = Math.min(x + dx, x + width - MIN);
    width = width + (x - newX);
    x = newX;
  } else {
    width = Math.max(MIN, width + dx);
  }
  if (corner === 'nw' || corner === 'ne') {
    const newY = Math.min(y + dy, y + height - MIN);
    height = height + (y - newY);
    y = newY;
  } else {
    height = Math.max(MIN, height + dy);
  }
  return { x, y, width, height };
}
