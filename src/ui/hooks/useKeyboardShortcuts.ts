/**
 * Global keyboard shortcuts. Ignored while typing in inputs/textareas or
 * while a modal dialog is open (except Escape, which the dialog handles).
 * The full list is shown in the shortcuts dialog (press ?).
 */

import { useEffect, useRef } from 'react';
import { selectActiveDocument, useEditorStore } from '../../editor-state/store';
import { printDocument } from '../../services/export-service';
import type { Tool } from '../../editor-state/types';

export interface ShortcutHandlers {
  onShowShortcuts(): void;
}

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  e: 'edit-text',
  x: 'erase',
  t: 'text',
  p: 'ink',
  h: 'highlight',
  r: 'rectangle',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
};

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  // Keep the latest handlers without re-subscribing the window listener.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditingTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;

      const store = useEditorStore.getState();
      const docState = selectActiveDocument(store);
      if (!docState) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (meta && key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && key.toLowerCase() === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (meta && key.toLowerCase() === 'a') {
        if (docState.doc.pages.length === 0) return;
        event.preventDefault();
        store.selectAll();
        return;
      }
      if (meta && key.toLowerCase() === 'p') {
        if (docState.doc.pages.length === 0 || store.busy) return;
        // Print the edited PDF, not the app's DOM.
        event.preventDefault();
        void printDocument().catch(() => undefined);
        return;
      }
      if (meta && key.toLowerCase() === 'd') {
        if (docState.selection.length === 0) return;
        event.preventDefault();
        store.duplicatePages(docState.selection);
        return;
      }
      if (meta) return;

      if (key === 'Delete' || key === 'Backspace') {
        if (docState.activeAnnotationId) {
          event.preventDefault();
          store.deleteAnnotation(docState.activeAnnotationId);
        } else if (docState.selection.length > 0) {
          event.preventDefault();
          store.deletePages(docState.selection);
        }
        return;
      }

      if (key === 'Escape') {
        if (docState.activeAnnotationId) store.setActiveAnnotation(null);
        else if (store.tool !== 'select') store.setTool('select');
        else store.clearSelection();
        return;
      }

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const { pages } = docState.doc;
        if (pages.length === 0) return;
        const index = pages.findIndex((page) => page.id === docState.activePageId);
        const next =
          key === 'ArrowLeft' ? Math.max(0, index - 1) : Math.min(pages.length - 1, index + 1);
        const target = pages[next];
        if (target && target.id !== docState.activePageId) {
          event.preventDefault();
          store.setActivePage(target.id);
        }
        return;
      }

      if (key === '[' || key === ']') {
        const ids =
          docState.selection.length > 0
            ? docState.selection
            : docState.activePageId
              ? [docState.activePageId]
              : [];
        if (ids.length === 0) return;
        event.preventDefault();
        store.rotateSelectedPages(key === '[' ? -90 : 90);
        return;
      }

      if (key === '?') {
        event.preventDefault();
        handlersRef.current.onShowShortcuts();
        return;
      }

      const tool = TOOL_KEYS[key.toLowerCase()];
      if (tool && !event.shiftKey && docState.doc.pages.length > 0) {
        store.setTool(tool);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
