/**
 * Command toolbar: file actions, undo/redo, annotation tools, page
 * operations, and exports. Buttons expose full labels to screen readers and
 * disable themselves when their preconditions aren't met.
 */

import { useRef, type JSX } from 'react';
import {
  selectActiveDocument,
  selectCanRedo,
  selectCanUndo,
  useEditorStore,
} from '../../editor-state/store';
import type { Tool } from '../../editor-state/types';
import { addBlankPage } from '../../services/new-document';
import { openFiles } from '../../services/open-files';
import { placeImageFromFile } from '../../services/place-image';
import {
  exportDocument,
  exportPagesAsZip,
  exportSelection,
  printDocument,
} from '../../services/export-service';
import { useToasts } from '../toast/Toasts';
import { useActiveDoc } from '../hooks/useActiveDoc';
import { Icon, type IconName } from '../icons';
import { RecentsMenu } from './RecentsMenu';

export interface ToolbarProps {
  onSplit(): void;
  onInsert(): void;
  onSignature(): void;
  onClear(): void;
  onShortcuts(): void;
}

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'select', icon: 'cursor', label: 'Select', key: 'V' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T' },
  { tool: 'ink', icon: 'pen', label: 'Draw', key: 'P' },
  { tool: 'highlight', icon: 'highlighter', label: 'Highlight', key: 'H' },
  { tool: 'rectangle', icon: 'square', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', icon: 'circle', label: 'Ellipse', key: 'O' },
  { tool: 'line', icon: 'line', label: 'Line', key: 'L' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A' },
];

export function Toolbar({
  onSplit,
  onInsert,
  onSignature,
  onClear,
  onShortcuts,
}: ToolbarProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const toasts = useToasts();

  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const selectionCount = useActiveDoc((docState) => docState.selection.length) ?? 0;
  const pageCount = useActiveDoc((docState) => docState.doc.pages.length) ?? 0;
  const busy = useEditorStore((state) => state.busy);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const rotateSelectedPages = useEditorStore((state) => state.rotateSelectedPages);
  const duplicatePages = useEditorStore((state) => state.duplicatePages);
  const deletePages = useEditorStore((state) => state.deletePages);
  const activePageId = useActiveDoc((docState) => docState.activePageId) ?? null;

  const hasSelectionOrActive = selectionCount > 0 || activePageId !== null;
  const deletable = selectionCount > 0 && selectionCount < pageCount;
  const exporting = busy !== null;

  const run = (work: () => Promise<void>, successMessage?: string): void => {
    void work()
      .then(() => successMessage && toasts.push('success', successMessage))
      .catch((error: unknown) =>
        toasts.push('error', error instanceof Error ? error.message : 'Something went wrong.'),
      );
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor commands">
      <div className="toolbar-group" aria-label="File">
        <button
          type="button"
          className="tool-button"
          title="Merge a PDF's pages into this document (drop files anywhere to open them as their own tabs)"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="filePlus" />
          <span>Merge PDF</span>
        </button>
        <button
          type="button"
          className="tool-button"
          title="Insert an empty A4 page after the current page"
          onClick={() => {
            const docState = selectActiveDocument(useEditorStore.getState());
            const activeIndex =
              docState?.doc.pages.findIndex((page) => page.id === docState.activePageId) ?? -1;
            run(
              () => addBlankPage(activeIndex >= 0 ? { insertAt: activeIndex + 1 } : undefined),
              'Blank page added.',
            );
          }}
        >
          <Icon name="blankPage" />
          <span>Blank page</span>
        </button>
        <button type="button" className="tool-button" onClick={onInsert} disabled={pageCount === 0}>
          <Icon name="split" />
          <span>Insert…</span>
        </button>
        <RecentsMenu />
      </div>

      <div className="toolbar-group" aria-label="History">
        <button
          type="button"
          className="icon-button"
          aria-label="Undo"
          title="Undo (Ctrl/⌘+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Redo"
          title="Redo (Shift+Ctrl/⌘+Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          <Icon name="redo" />
        </button>
      </div>

      <div className="toolbar-group" role="radiogroup" aria-label="Annotation tools">
        {TOOLS.map((entry) => (
          <button
            key={entry.tool}
            type="button"
            className={`icon-button ${tool === entry.tool ? 'is-on' : ''}`}
            role="radio"
            aria-checked={tool === entry.tool}
            aria-label={`${entry.label} tool`}
            title={`${entry.label} (${entry.key})`}
            onClick={() => setTool(entry.tool)}
          >
            <Icon name={entry.icon} />
          </button>
        ))}
        <button
          type="button"
          className="icon-button"
          aria-label="Place image or stamp"
          title="Place image or stamp"
          onClick={() => imageInputRef.current?.click()}
        >
          <Icon name="image" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Add signature"
          title="Add signature"
          onClick={onSignature}
        >
          <Icon name="signature" />
        </button>
      </div>

      <div className="toolbar-group" aria-label="Page operations">
        <button
          type="button"
          className="icon-button"
          aria-label="Rotate left"
          title="Rotate left ([)"
          disabled={!hasSelectionOrActive}
          onClick={() => rotateSelectedPages(-90)}
        >
          <Icon name="rotateLeft" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Rotate right"
          title="Rotate right (])"
          disabled={!hasSelectionOrActive}
          onClick={() => rotateSelectedPages(90)}
        >
          <Icon name="rotateRight" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Duplicate selected pages"
          title="Duplicate pages (Ctrl/⌘+D)"
          disabled={selectionCount === 0}
          onClick={() => {
            const docState = selectActiveDocument(useEditorStore.getState());
            if (docState) duplicatePages(docState.selection);
          }}
        >
          <Icon name="duplicate" />
        </button>
        <button
          type="button"
          className="icon-button is-danger"
          aria-label="Delete selected pages"
          title={
            selectionCount > 0 && !deletable ? 'Cannot delete every page' : 'Delete pages (Del)'
          }
          disabled={!deletable}
          onClick={() => {
            const docState = selectActiveDocument(useEditorStore.getState());
            if (docState) deletePages(docState.selection);
          }}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="toolbar-group" aria-label="Export">
        <button
          type="button"
          className="tool-button"
          title="Split by page ranges into new document tabs"
          onClick={onSplit}
          disabled={pageCount === 0 || exporting}
        >
          <Icon name="split" />
          <span>Split…</span>
        </button>
        <button
          type="button"
          className="tool-button"
          disabled={pageCount === 0 || exporting}
          title="Every page of this document as its own PDF, packed into a ZIP"
          onClick={() => run(exportPagesAsZip, 'ZIP download started.')}
        >
          <Icon name="zip" />
          <span>ZIP</span>
        </button>
        <button
          type="button"
          className="tool-button"
          disabled={selectionCount === 0 || exporting}
          title="Download only the selected pages as one PDF"
          onClick={() => run(exportSelection, 'PDF download started.')}
        >
          <Icon name="scissors" />
          <span>Export selection{selectionCount > 0 ? ` (${selectionCount})` : ''}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Print document"
          title="Print the edited document (Ctrl/⌘+P)"
          disabled={pageCount === 0 || exporting}
          onClick={() => run(printDocument)}
        >
          <Icon name="printer" />
        </button>
        <button
          type="button"
          className="tool-button is-primary"
          disabled={pageCount === 0 || exporting}
          title="Download the whole edited document — all pages, regardless of selection"
          onClick={() => run(exportDocument, 'PDF download started.')}
        >
          <Icon name="download" />
          <span>Export PDF</span>
        </button>
      </div>

      <div className="toolbar-group toolbar-end" aria-label="Workspace">
        <button
          type="button"
          className="icon-button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={onShortcuts}
        >
          <Icon name="question" />
        </button>
        <button
          type="button"
          className="icon-button is-danger"
          aria-label="Close document"
          title="Close document"
          onClick={onClear}
        >
          <Icon name="broom" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length === 0) return;
          run(async () => {
            const result = await openFiles(files, { mode: 'merge' });
            for (const failure of result.errors) {
              toasts.push('error', `${failure.name}: ${failure.message}`);
            }
            if (result.openedFiles > 0) {
              toasts.push(
                'success',
                `Merged ${result.openedPages} page${result.openedPages === 1 ? '' : 's'} from ${result.openedFiles} file${result.openedFiles === 1 ? '' : 's'}.`,
              );
            }
          });
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) run(() => placeImageFromFile(file), 'Image placed — drag it into position.');
        }}
      />
    </div>
  );
}
