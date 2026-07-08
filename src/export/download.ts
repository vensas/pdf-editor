/**
 * Browser download helpers. Downloads are plain object-URL anchors — files
 * are produced and saved locally, nothing ever leaves the machine.
 */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  downloadBlob(new Blob([bytes.slice()], { type: 'application/pdf' }), fileName);
}

export function downloadZip(bytes: Uint8Array, fileName: string): void {
  downloadBlob(new Blob([bytes.slice()], { type: 'application/zip' }), fileName);
}

/** Strips the .pdf extension and unsafe filename characters. */
export function safeBaseName(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return base === '' ? 'document' : base;
}
