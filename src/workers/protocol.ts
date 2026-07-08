/**
 * Typed message protocol between the main thread and the export worker.
 * Only structured-clone-safe data crosses the boundary.
 */

import type { PdfErrorCode } from '../pdf-core/errors';
import type { AssembleInput, PagePlanItem, SourceId } from '../pdf-core/types';

export interface AssembleRequest {
  id: number;
  kind: 'assemble';
  /** One output document per job. */
  jobs: { pages: PagePlanItem[] }[];
  sources: Record<SourceId, Uint8Array>;
  assets: AssembleInput['assets'];
}

export interface ZipRequest {
  id: number;
  kind: 'zip';
  files: { name: string; bytes: Uint8Array }[];
}

export type WorkerRequest = AssembleRequest | ZipRequest;

export type WorkerResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'assembled'; documents: Uint8Array[] }
  | { id: number; type: 'zipped'; bytes: Uint8Array }
  | { id: number; type: 'error'; code: PdfErrorCode; message: string };
