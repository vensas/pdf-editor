/**
 * Pure ZIP creation. Used by the export worker and directly in tests.
 */

import JSZip from 'jszip';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export async function createZip(files: ZipEntry[]): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('Nothing to zip.');
  }
  const zip = new JSZip();
  const seen = new Set<string>();
  for (const file of files) {
    // JSZip silently overwrites duplicate names; disambiguate instead.
    let name = file.name;
    let counter = 2;
    while (seen.has(name)) {
      name = file.name.replace(/(\.[^.]+)?$/, ` (${counter})$1`);
      counter += 1;
    }
    seen.add(name);
    zip.file(name, file.bytes);
  }
  return zip.generateAsync({ type: 'uint8array' });
}
