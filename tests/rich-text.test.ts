import { describe, expect, it } from 'vitest';
import {
  blocksToTiptapDoc,
  emptyRichText,
  richTextPlainText,
  tiptapDocToBlocks,
  type PMNode,
} from '../src/pdf-core/rich-text';
import type { RichTextBlock } from '../src/pdf-core/types';

describe('richTextPlainText', () => {
  it('joins spans and blocks with newlines', () => {
    const blocks: RichTextBlock[] = [
      { spans: [{ text: 'Hello ' }, { text: 'world', bold: true }] },
      { spans: [{ text: 'second line' }] },
    ];
    expect(richTextPlainText(blocks)).toBe('Hello world\nsecond line');
  });

  it('is empty for an empty document', () => {
    expect(richTextPlainText(emptyRichText())).toBe('');
  });
});

describe('tiptapDocToBlocks', () => {
  it('maps paragraphs to blocks and marks to span flags', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: 'both',
              marks: [{ type: 'italic' }, { type: 'underline' }],
            },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'struck', marks: [{ type: 'strike' }] }],
        },
      ],
    };
    expect(tiptapDocToBlocks(doc)).toEqual([
      {
        spans: [
          { text: 'plain ' },
          { text: 'bold', bold: true },
          { text: 'both', italic: true, underline: true },
        ],
      },
      { spans: [] },
      { spans: [{ text: 'struck', strike: true }] },
    ]);
  });

  it('splits a paragraph at hard breaks', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'one' },
            { type: 'hardBreak' },
            { type: 'text', text: 'two' },
          ],
        },
      ],
    };
    expect(tiptapDocToBlocks(doc)).toEqual([
      { spans: [{ text: 'one' }] },
      { spans: [{ text: 'two' }] },
    ]);
  });

  it('ignores unknown marks and keeps text of unknown nodes', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'linked', marks: [{ type: 'link' }] }],
        },
      ],
    };
    expect(tiptapDocToBlocks(doc)).toEqual([{ spans: [{ text: 'linked' }] }]);
  });

  it('falls back to one empty block for an empty doc', () => {
    expect(tiptapDocToBlocks({ type: 'doc' })).toEqual(emptyRichText());
  });
});

describe('blocksToTiptapDoc', () => {
  it('round-trips through tiptapDocToBlocks', () => {
    const blocks: RichTextBlock[] = [
      { spans: [{ text: 'a', bold: true }, { text: 'b' }] },
      { spans: [] },
      { spans: [{ text: 'c', italic: true, strike: true }] },
    ];
    expect(tiptapDocToBlocks(blocksToTiptapDoc(blocks))).toEqual(blocks);
  });

  it('emits paragraphs without content for empty blocks', () => {
    expect(blocksToTiptapDoc([{ spans: [] }])).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('produces an empty paragraph doc for no blocks', () => {
    expect(blocksToTiptapDoc([])).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });
});
