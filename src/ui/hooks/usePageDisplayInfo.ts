/**
 * Display size/rotation of a page, derived from referentially stable store
 * slices so zustand's useSyncExternalStore never sees a fresh object.
 */

import { useMemo } from 'react';
import type { PageRef } from '../../pdf-core/types';
import { computeDisplayInfo, type PageDisplayInfo } from '../../editor-state/selectors';
import { useEditorStore } from '../../editor-state/store';

export function usePageDisplayInfo(page: PageRef): PageDisplayInfo {
  const info = useEditorStore((state) => state.sources[page.sourceId]?.pageInfos[page.sourceIndex]);
  return useMemo(() => computeDisplayInfo(info, page.rotation), [info, page.rotation]);
}
