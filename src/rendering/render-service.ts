/**
 * Owns the pdf.js documents for all loaded sources and serializes render
 * work through a small queue so a 300-page import doesn't fire hundreds of
 * concurrent render calls.
 */

import type { Rotation, SourceId, SourcePageInfo } from '../pdf-core/types';
import type { LoadedPdfDocument } from './pdfjs-loader';

const MAX_CONCURRENT_RENDERS = 2;

interface QueueTask {
  run(): Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

class RenderQueue {
  private readonly waiting: QueueTask[] = [];
  private active = 0;

  enqueue(run: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ run, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < MAX_CONCURRENT_RENDERS) {
      const task = this.waiting.shift();
      if (!task) return;
      this.active += 1;
      task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

export interface RegisteredSource {
  pageCount: number;
  pageInfos: SourcePageInfo[];
}

class RenderService {
  private readonly documents = new Map<SourceId, LoadedPdfDocument>();
  private readonly queue = new RenderQueue();

  /** Loads a source with pdf.js and keeps it for rendering. */
  async register(sourceId: SourceId, bytes: Uint8Array): Promise<RegisteredSource> {
    // Lazy import keeps pdf.js (~350 kB) out of the initial bundle; it loads
    // when the first document is opened.
    const { loadPdfDocument } = await import('./pdfjs-loader');
    const doc = await loadPdfDocument(bytes);
    this.documents
      .get(sourceId)
      ?.destroy()
      .catch(() => undefined);
    this.documents.set(sourceId, doc);
    return { pageCount: doc.pageCount, pageInfos: doc.pageInfos };
  }

  isRegistered(sourceId: SourceId): boolean {
    return this.documents.has(sourceId);
  }

  pageInfo(sourceId: SourceId, pageIndex: number): SourcePageInfo | undefined {
    return this.documents.get(sourceId)?.pageInfos[pageIndex];
  }

  /**
   * Renders a page into the given canvas. Resolves when drawn; rejects with
   * a classified PdfError when rendering fails. Silently skips when the
   * source has been released in the meantime (e.g. document cleared).
   */
  render(
    sourceId: SourceId,
    pageIndex: number,
    target: {
      canvas: HTMLCanvasElement;
      cssWidth: number;
      rotation: Rotation;
      pixelRatio?: number;
    },
  ): Promise<void> {
    return this.queue.enqueue(async () => {
      const doc = this.documents.get(sourceId);
      if (!doc) return;
      await doc.renderPage(pageIndex, target);
    });
  }

  /** Releases the pdf.js resources of one source. */
  release(sourceId: SourceId): void {
    this.documents
      .get(sourceId)
      ?.destroy()
      .catch(() => undefined);
    this.documents.delete(sourceId);
  }

  releaseAll(): void {
    for (const id of [...this.documents.keys()]) this.release(id);
  }
}

/** App-wide singleton; pdf.js documents are not serializable state. */
export const renderService = new RenderService();
