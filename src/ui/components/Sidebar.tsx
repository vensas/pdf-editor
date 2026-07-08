/**
 * Thumbnail sidebar: selection (click, Cmd/Ctrl-click, Shift-click), drag &
 * drop reordering (dragging a selected page moves the whole selection), and
 * quick per-page actions via the toolbar/properties panel.
 */

import { useCallback, useRef, useState, type JSX } from 'react';
import { useEditorStore } from '../../editor-state/store';
import { useActiveDoc } from '../hooks/useActiveDoc';
import { PageThumbnail } from './PageThumbnail';

interface DropTarget {
  index: number;
  half: 'before' | 'after';
}

const NO_PAGES: never[] = [];

export function Sidebar(): JSX.Element {
  const pages = useActiveDoc((docState) => docState.doc.pages) ?? NO_PAGES;
  const selection = useActiveDoc((docState) => docState.selection) ?? NO_PAGES;
  const activePageId = useActiveDoc((docState) => docState.activePageId) ?? null;
  const selectOnly = useEditorStore((state) => state.selectOnly);
  const toggleSelect = useEditorStore((state) => state.toggleSelect);
  const rangeSelect = useEditorStore((state) => state.rangeSelect);
  const selectAll = useEditorStore((state) => state.selectAll);
  const reorderPages = useEditorStore((state) => state.reorderPages);

  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggedIds = useRef<string[]>([]);

  const handleSelect = useCallback(
    (event: React.MouseEvent, pageId: string) => {
      if (event.shiftKey) rangeSelect(pageId);
      else if (event.metaKey || event.ctrlKey) toggleSelect(pageId);
      else selectOnly(pageId);
    },
    [rangeSelect, toggleSelect, selectOnly],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, pageId: string) => {
      const ids = selection.includes(pageId) ? selection : [pageId];
      draggedIds.current = ids;
      event.dataTransfer.effectAllowed = 'move';
      // Some browsers require data for a drag to start.
      event.dataTransfer.setData('text/plain', String(ids.length));
    },
    [selection],
  );

  const handleDragOver = useCallback((event: React.DragEvent, index: number) => {
    if (draggedIds.current.length === 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const half: DropTarget['half'] =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget((current) =>
      current?.index === index && current.half === half ? current : { index, half },
    );
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent, index: number) => {
      event.preventDefault();
      const ids = draggedIds.current;
      draggedIds.current = [];
      setDropTarget(null);
      if (ids.length === 0) return;

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const rawTarget = before ? index : index + 1;
      // reorderPages expects an index into the list without the moved pages.
      const idSet = new Set(ids);
      const removedAbove = pages.slice(0, rawTarget).filter((page) => idSet.has(page.id)).length;
      reorderPages(ids, rawTarget - removedAbove);
    },
    [pages, reorderPages],
  );

  const handleDragEnd = useCallback(() => {
    draggedIds.current = [];
    setDropTarget(null);
  }, []);

  const allSelected = pages.length > 0 && selection.length === pages.length;

  return (
    <aside className="sidebar" aria-label="Pages">
      <div className="sidebar-header">
        <h2>
          Pages <span className="muted">({pages.length})</span>
        </h2>
        <button type="button" className="link-button" onClick={selectAll}>
          {allSelected ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ol className="page-list" onDragEnd={handleDragEnd} onDragLeave={() => setDropTarget(null)}>
        {pages.map((page, index) => (
          <PageThumbnail
            key={page.id}
            page={page}
            index={index}
            selected={selection.includes(page.id)}
            active={page.id === activePageId}
            dropIndicator={dropTarget?.index === index ? dropTarget.half : null}
            onPointerSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </ol>
      <p className="sidebar-hint muted">
        Drag to reorder · Shift-click for ranges ·{' '}
        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
        -click to multi-select
      </p>
    </aside>
  );
}
