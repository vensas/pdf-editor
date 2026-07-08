/**
 * Typed RPC client for the export worker. Falls back to running the same
 * pure functions on the main thread when Workers are unavailable (tests,
 * exotic embedders) — the app stays functional either way.
 */

import { PdfError } from '../pdf-core/errors';
import type { AssembleInput, PagePlanItem, SourceId } from '../pdf-core/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

export interface ProgressHandler {
  (done: number, total: number): void;
}

interface PendingCall {
  resolve(response: WorkerResponse): void;
  reject(error: unknown): void;
  onProgress?: ProgressHandler | undefined;
}

class PdfWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();

  /**
   * Builds one PDF per job. Source bytes are copied and the copies are
   * transferred, so the caller keeps ownership of its buffers.
   */
  async assemble(
    jobs: { pages: PagePlanItem[] }[],
    sources: Record<SourceId, Uint8Array>,
    assets: AssembleInput['assets'],
    onProgress?: ProgressHandler,
  ): Promise<Uint8Array[]> {
    if (!this.workerSupported()) {
      const { assembleDocuments } = await import('../pdf-core/assemble');
      return assembleDocuments(jobs, sources, assets, onProgress);
    }

    const transfer: Transferable[] = [];
    const clonedSources: Record<SourceId, Uint8Array> = {};
    for (const [id, bytes] of Object.entries(sources)) {
      const copy = bytes.slice();
      clonedSources[id] = copy;
      transfer.push(copy.buffer as ArrayBuffer);
    }
    const clonedAssets: AssembleInput['assets'] = {};
    for (const [id, asset] of Object.entries(assets)) {
      const copy = asset.bytes.slice();
      clonedAssets[id] = { mime: asset.mime, bytes: copy };
      transfer.push(copy.buffer as ArrayBuffer);
    }

    const response = await this.call(
      { id: 0, kind: 'assemble', jobs, sources: clonedSources, assets: clonedAssets },
      transfer,
      onProgress,
    );
    if (response.type !== 'assembled') throw new PdfError('export-failed');
    return response.documents;
  }

  async zip(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
    if (!this.workerSupported()) {
      const { createZip } = await import('../export/zip');
      return createZip(files);
    }
    // The PDFs being zipped were just produced by the worker and are owned by
    // the caller; transfer copies to avoid detaching the caller's buffers.
    const transfer: Transferable[] = [];
    const cloned = files.map((file) => {
      const copy = file.bytes.slice();
      transfer.push(copy.buffer as ArrayBuffer);
      return { name: file.name, bytes: copy };
    });
    const response = await this.call({ id: 0, kind: 'zip', files: cloned }, transfer);
    if (response.type !== 'zipped') throw new PdfError('export-failed');
    return response.bytes;
  }

  private workerSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const call = this.pending.get(message.id);
      if (!call) return;
      if (message.type === 'progress') {
        call.onProgress?.(message.done, message.total);
        return;
      }
      this.pending.delete(message.id);
      if (message.type === 'error') {
        call.reject(new PdfError(message.code, message.message));
      } else {
        call.resolve(message);
      }
    };
    this.worker.onerror = () => {
      // A crashed worker leaves promises dangling; fail them all and let the
      // next request start a fresh worker.
      const error = new PdfError('export-failed');
      for (const call of this.pending.values()) call.reject(error);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }

  private call(
    request: WorkerRequest,
    transfer: Transferable[],
    onProgress?: ProgressHandler,
  ): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ ...request, id }, transfer);
    });
  }
}

export const pdfWorker = new PdfWorkerClient();
