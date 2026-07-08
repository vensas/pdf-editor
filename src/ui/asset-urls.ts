/**
 * Object-URL cache for image assets so annotation previews don't recreate
 * blob URLs on every render. URLs live for the session; assets are tiny
 * compared to the PDFs themselves.
 */

import type { ImageAsset } from '../pdf-core/types';

const urls = new Map<string, string>();

export function assetUrl(asset: ImageAsset): string {
  const cached = urls.get(asset.id);
  if (cached) return cached;
  const url = URL.createObjectURL(new Blob([asset.bytes.slice()], { type: asset.mime }));
  urls.set(asset.id, url);
  return url;
}

export function revokeAllAssetUrls(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}
