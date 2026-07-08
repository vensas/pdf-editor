/**
 * One page card in the sidebar: lazily rendered thumbnail, selection state,
 * drag & drop reorder handle. Rendering waits until the card scrolls into
 * view so importing a huge PDF doesn't render hundreds of pages upfront.
 */

import { memo, useEffect, useRef, useState, type JSX } from 'react';
import type { PageRef } from '../../pdf-core/types';
import { renderService } from '../../rendering/render-service';
import { usePageDisplayInfo } from '../hooks/usePageDisplayInfo';
import { Icon } from '../icons';

const THUMB_WIDTH = 148;

export interface PageThumbnailProps {
  page: PageRef;
  index: number;
  selected: boolean;
  active: boolean;
  dropIndicator: 'before' | 'after' | null;
  onPointerSelect(event: React.MouseEvent, pageId: string): void;
  onDragStart(event: React.DragEvent, pageId: string): void;
  onDragOver(event: React.DragEvent, index: number): void;
  onDrop(event: React.DragEvent, index: number): void;
}

export const PageThumbnail = memo(function PageThumbnail({
  page,
  index,
  selected,
  active,
  dropIndicator,
  onPointerSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: PageThumbnailProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);

  const display = usePageDisplayInfo(page);
  const aspect = display.height / display.width;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setRenderFailed(false);
    renderService
      .render(page.sourceId, page.sourceIndex, {
        canvas,
        cssWidth: THUMB_WIDTH,
        rotation: page.rotation,
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, page.sourceId, page.sourceIndex, page.rotation]);

  return (
    <li
      className={[
        'page-card',
        selected ? 'is-selected' : '',
        active ? 'is-active' : '',
        dropIndicator ? `drop-${dropIndicator}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => onDragOver(event, index)}
      onDrop={(event) => onDrop(event, index)}
    >
      <button
        ref={cardRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className="page-card-button"
        draggable
        aria-label={`Page ${index + 1}${selected ? ', selected' : ''}`}
        aria-pressed={selected}
        onClick={(event) => onPointerSelect(event, page.id)}
        onDragStart={(event) => onDragStart(event, page.id)}
      >
        <span className="page-card-frame" style={{ aspectRatio: `${1 / aspect}` }}>
          {renderFailed ? (
            <span className="thumb-error">Preview unavailable</span>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </span>
        <span className="page-card-footer">
          <span className="page-number">{index + 1}</span>
          {selected && (
            <span className="page-check" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
          )}
          {page.rotation !== 0 && <span className="page-rotation">{page.rotation}°</span>}
        </span>
      </button>
    </li>
  );
});
