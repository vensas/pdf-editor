/**
 * Export worker: runs pdf-lib assembly and ZIP packing off the main thread
 * so the UI stays responsive during large exports.
 */

import { assembleDocuments } from '../pdf-core/assemble';
import { classifyPdfError } from '../pdf-core/errors';
import { createZip } from '../export/zip';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

scope.onmessage = (event) => {
  void handle(event.data);
};

async function handle(request: WorkerRequest): Promise<void> {
  try {
    if (request.kind === 'assemble') {
      const documents = await assembleDocuments(
        request.jobs,
        request.sources,
        request.assets,
        (done, total) => scope.postMessage({ id: request.id, type: 'progress', done, total }),
      );
      scope.postMessage(
        { id: request.id, type: 'assembled', documents },
        documents.map((doc) => doc.buffer as ArrayBuffer),
      );
      return;
    }

    const bytes = await createZip(request.files);
    scope.postMessage({ id: request.id, type: 'zipped', bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (error) {
    const classified = classifyPdfError(error, 'export-failed');
    scope.postMessage({
      id: request.id,
      type: 'error',
      code: classified.code,
      message: classified.message,
    });
  }
}
