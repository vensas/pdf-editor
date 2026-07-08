/**
 * Selector hook over the active document (tab). The selector must return a
 * referentially stable slice (a field of DocumentState) — deriving fresh
 * objects here would loop useSyncExternalStore.
 */

import { selectActiveDocument, useEditorStore } from '../../editor-state/store';
import type { DocumentState } from '../../editor-state/types';

export function useActiveDoc<T>(selector: (docState: DocumentState) => T): T | undefined {
  return useEditorStore((state) => {
    const docState = selectActiveDocument(state);
    return docState ? selector(docState) : undefined;
  });
}
