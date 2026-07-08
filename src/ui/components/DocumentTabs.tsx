/**
 * Tab bar for the open documents. Every document keeps its own pages,
 * annotations, selection, and undo history; closing a tab moves imported
 * files to "Recent". The "+" tab opens a fresh blank document.
 */

import { type JSX } from 'react';
import { isPristineBlankDocument } from '../../editor-state/selectors';
import { useEditorStore } from '../../editor-state/store';
import { closeDocument, newBlankDocument } from '../../services/new-document';
import { useToasts } from '../toast/Toasts';
import { Icon } from '../icons';

export function DocumentTabs(): JSX.Element {
  const documentOrder = useEditorStore((state) => state.documentOrder);
  const documents = useEditorStore((state) => state.documents);
  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const setActiveDocument = useEditorStore((state) => state.setActiveDocument);
  const toasts = useToasts();

  const requestClose = (id: string): void => {
    const state = useEditorStore.getState();
    const docState = state.documents[id];
    if (!docState) return;
    const pristine = isPristineBlankDocument(state, docState);
    if (
      pristine ||
      window.confirm(
        `Close “${docState.docName}”? Unsaved edits are discarded; imported files stay available under “Recent”.`,
      )
    ) {
      void closeDocument(id).catch(() => toasts.push('error', 'Could not close the document.'));
    }
  };

  return (
    <div className="document-tabs" role="tablist" aria-label="Open documents">
      {documentOrder.map((id) => {
        const docState = documents[id];
        if (!docState) return null;
        const active = id === activeDocumentId;
        return (
          <div key={id} className={`document-tab ${active ? 'is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="document-tab-button"
              title={docState.docName}
              onClick={() => setActiveDocument(id)}
            >
              <span className="document-tab-name">{docState.docName}</span>
              <span className="document-tab-count">{docState.doc.pages.length}</span>
            </button>
            <button
              type="button"
              className="document-tab-close"
              aria-label={`Close ${docState.docName}`}
              onClick={() => requestClose(id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="document-tab-new"
        title="New blank document"
        aria-label="New blank document"
        onClick={() => {
          void newBlankDocument().catch(() =>
            toasts.push('error', 'Could not create a blank document.'),
          );
        }}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
