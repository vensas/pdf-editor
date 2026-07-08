/**
 * Main canvas: large preview of the active page with zoom controls and the
 * annotation overlay. Zoom defaults to fit-to-view and recomputes on resize.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { Rect } from '../../pdf-core/types';
import { renderService } from '../../rendering/render-service';
import { sampleBackgroundColor } from '../../rendering/sample-background';
import { computeDisplayInfo } from '../../editor-state/selectors';
import { useEditorStore } from '../../editor-state/store';
import { useActiveDoc } from '../hooks/useActiveDoc';
import { AnnotationLayer } from './AnnotationLayer';
import { Icon } from '../icons';

const ZOOM_LEVELS = [0.25, 0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 3, 4];
const VIEW_PADDING = 48;
const NO_PAGES: never[] = [];

export function CanvasView(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewSize, setViewSize] = useState({ width: 800, height: 600 });
  const [zoomSetting, setZoomSetting] = useState<'fit' | number>('fit');
  const [renderFailed, setRenderFailed] = useState(false);

  const pages = useActiveDoc((docState) => docState.doc.pages) ?? NO_PAGES;
  const activePageId = useActiveDoc((docState) => docState.activePageId) ?? null;
  const setActivePage = useEditorStore((state) => state.setActivePage);

  const pageIndex = pages.findIndex((page) => page.id === activePageId);
  const page = pageIndex >= 0 ? pages[pageIndex] : undefined;
  const pageInfo = useEditorStore((state) =>
    page ? state.sources[page.sourceId]?.pageInfos[page.sourceIndex] : undefined,
  );
  const display = useMemo(
    () => (page ? computeDisplayInfo(pageInfo, page.rotation) : null),
    [page, pageInfo],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const zoom = useMemo(() => {
    if (!display) return 1;
    if (zoomSetting === 'fit') {
      const scale = Math.min(
        (viewSize.width - VIEW_PADDING) / display.width,
        (viewSize.height - VIEW_PADDING) / display.height,
      );
      return Math.min(Math.max(scale, 0.1), 2.5);
    }
    return zoomSetting;
  }, [display, zoomSetting, viewSize]);

  useEffect(() => {
    if (!page || !display) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setRenderFailed(false);
    renderService
      .render(page.sourceId, page.sourceIndex, {
        canvas,
        cssWidth: display.width * zoom,
        rotation: page.rotation,
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [page, display, zoom]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const current = zoom;
      const next =
        direction === 1
          ? ZOOM_LEVELS.find((level) => level > current + 0.01)
          : [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.01);
      if (next) setZoomSetting(next);
    },
    [zoom],
  );

  const sampleBackground = useCallback(
    (rect: Rect): string => {
      const canvas = canvasRef.current;
      if (!canvas || !display || canvas.width === 0) return '#ffffff';
      // Canvas pixels per display point (canvas is rendered at display.width * zoom * dpr).
      return sampleBackgroundColor(canvas, rect, canvas.width / display.width);
    },
    [display],
  );

  if (!page || !display) {
    return (
      <section className="canvas-view" aria-label="Page preview">
        <p className="muted canvas-placeholder">Preparing your document…</p>
      </section>
    );
  }

  return (
    <section className="canvas-view" aria-label="Page preview">
      <div className="canvas-scroll" ref={containerRef}>
        <div
          className="page-stage"
          style={{ width: display.width * zoom, height: display.height * zoom }}
        >
          {renderFailed ? (
            <p className="thumb-error">This page could not be rendered.</p>
          ) : (
            <canvas
              ref={canvasRef}
              className="page-canvas"
              role="img"
              aria-label={`Page ${pageIndex + 1}`}
            />
          )}
          <AnnotationLayer
            page={page}
            displayWidth={display.width}
            displayHeight={display.height}
            zoom={zoom}
            sampleBackground={sampleBackground}
          />
        </div>
      </div>

      <footer className="canvas-controls">
        <div className="canvas-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous page"
            disabled={pageIndex <= 0}
            onClick={() => setActivePage(pages[pageIndex - 1]!.id)}
          >
            <Icon name="undo" />
          </button>
          <span className="canvas-page-label">
            Page {pageIndex + 1} of {pages.length}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next page"
            disabled={pageIndex >= pages.length - 1}
            onClick={() => setActivePage(pages[pageIndex + 1]!.id)}
          >
            <Icon name="redo" />
          </button>
        </div>
        <div className="canvas-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => zoomBy(-1)}
          >
            <Icon name="minus" />
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1)}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className={`icon-button ${zoomSetting === 'fit' ? 'is-on' : ''}`}
            aria-label="Fit page to view"
            aria-pressed={zoomSetting === 'fit'}
            onClick={() => setZoomSetting('fit')}
          >
            <Icon name="fit" />
          </button>
        </div>
      </footer>
    </section>
  );
}
