/**
 * Placing image/signature annotations: decodes the image locally, stores it
 * as an asset, and adds an image annotation centered on the active page.
 */

import type { ImageAsset, Rect } from '../pdf-core/types';
import { pageDisplayInfo } from '../editor-state/selectors';
import { selectActiveDocument, useEditorStore } from '../editor-state/store';

const SUPPORTED = new Set(['image/png', 'image/jpeg']);

export async function placeImageFromFile(file: File): Promise<void> {
  if (!SUPPORTED.has(file.type)) {
    throw new Error('Only PNG and JPEG images are supported.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await placeImage(bytes, file.type as 'image/png' | 'image/jpeg');
}

export async function placeImage(
  bytes: Uint8Array,
  mime: 'image/png' | 'image/jpeg',
): Promise<void> {
  const size = await imageSize(bytes, mime);
  const state = useEditorStore.getState();
  const docState = selectActiveDocument(state);
  const page = docState?.doc.pages.find((candidate) => candidate.id === docState.activePageId);
  if (!page) throw new Error('Open a page first, then place the image.');

  const display = pageDisplayInfo(state, page);
  // Initial placement: 40% of the page width, centered, aspect preserved.
  const width = Math.min(display.width * 0.4, size.width);
  const height = width * (size.height / size.width);
  const rect: Rect = {
    x: (display.width - width) / 2,
    y: (display.height - height) / 2,
    width,
    height,
  };

  const asset: ImageAsset = {
    id: crypto.randomUUID(),
    mime,
    bytes,
    width: size.width,
    height: size.height,
  };
  state.addAnnotation(
    { kind: 'image', id: crypto.randomUUID(), pageId: page.id, rect, assetId: asset.id },
    asset,
  );
}

async function imageSize(
  bytes: Uint8Array,
  mime: string,
): Promise<{ width: number; height: number }> {
  const blob = new Blob([bytes.slice()], { type: mime });
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read.'));
    };
    image.src = url;
  });
}
