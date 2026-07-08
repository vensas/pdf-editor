import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createZip } from '../src/export/zip';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('createZip', () => {
  it('packs all files and preserves their content', async () => {
    const zipped = await createZip([
      { name: 'a.pdf', bytes: bytes('AAA') },
      { name: 'b.pdf', bytes: bytes('BBB') },
    ]);
    const zip = await JSZip.loadAsync(zipped);
    expect(Object.keys(zip.files).sort()).toEqual(['a.pdf', 'b.pdf']);
    expect(await zip.file('a.pdf')!.async('text')).toBe('AAA');
    expect(await zip.file('b.pdf')!.async('text')).toBe('BBB');
  });

  it('disambiguates duplicate names instead of overwriting', async () => {
    const zipped = await createZip([
      { name: 'page.pdf', bytes: bytes('one') },
      { name: 'page.pdf', bytes: bytes('two') },
      { name: 'page.pdf', bytes: bytes('three') },
    ]);
    const zip = await JSZip.loadAsync(zipped);
    expect(Object.keys(zip.files).sort()).toEqual(['page (2).pdf', 'page (3).pdf', 'page.pdf']);
    expect(await zip.file('page (3).pdf')!.async('text')).toBe('three');
  });

  it('rejects empty input', async () => {
    await expect(createZip([])).rejects.toThrow(/nothing to zip/i);
  });
});
