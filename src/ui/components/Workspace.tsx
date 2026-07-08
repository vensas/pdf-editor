/**
 * The editor layout: document tabs and toolbar on top, thumbnails left,
 * canvas in the middle, properties on the right. Owns the editor dialogs.
 */

import { useState, type JSX } from 'react';
import { isPristineBlankDocument } from '../../editor-state/selectors';
import { selectActiveDocument, useEditorStore } from '../../editor-state/store';
import { closeDocument } from '../../services/new-document';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CanvasView } from './CanvasView';
import { DocumentTabs } from './DocumentTabs';
import { PropertiesPanel } from './PropertiesPanel';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { InsertDialog } from './dialogs/InsertDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { SignatureDialog } from './dialogs/SignatureDialog';
import { SplitDialog } from './dialogs/SplitDialog';

type DialogName = 'split' | 'insert' | 'signature' | 'shortcuts' | null;

export function Workspace(): JSX.Element {
  const [dialog, setDialog] = useState<DialogName>(null);
  const close = (): void => setDialog(null);

  useKeyboardShortcuts({ onShowShortcuts: () => setDialog('shortcuts') });

  return (
    <div className="workspace">
      <DocumentTabs />
      <Toolbar
        onSplit={() => setDialog('split')}
        onInsert={() => setDialog('insert')}
        onSignature={() => setDialog('signature')}
        onShortcuts={() => setDialog('shortcuts')}
        onClear={() => {
          const state = useEditorStore.getState();
          const docState = selectActiveDocument(state);
          if (!docState) return;
          if (
            isPristineBlankDocument(state, docState) ||
            window.confirm(
              `Close “${docState.docName}”? Unsaved edits are discarded; imported files stay available under “Recent”.`,
            )
          ) {
            void closeDocument(docState.id);
          }
        }}
      />
      <div className="workspace-panes">
        <Sidebar />
        <CanvasView />
        <PropertiesPanel />
      </div>

      <SplitDialog open={dialog === 'split'} onClose={close} />
      <InsertDialog open={dialog === 'insert'} onClose={close} />
      <SignatureDialog open={dialog === 'signature'} onClose={close} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={close} />
    </div>
  );
}
