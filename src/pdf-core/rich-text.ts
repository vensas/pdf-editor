/**
 * Rich text model helpers: conversion between the editor's ProseMirror
 * document JSON (as produced by Tiptap's StarterKit schema) and the plain
 * RichTextBlock model stored on annotations, plus small utilities shared by
 * the SVG preview and the pdf-lib bake.
 *
 * Operates on plain JSON only, so pdf-core stays free of editor dependencies
 * and the conversions are trivially testable in node.
 */

import type { RichTextBlock, RichTextSpan } from './types';

/** Minimal structural type for a ProseMirror node as JSON. */
export interface PMNode {
  type?: string;
  text?: string;
  marks?: { type: string }[];
  content?: PMNode[];
}

const MARK_KEYS = ['bold', 'italic', 'underline', 'strike'] as const;

/** An empty document: one paragraph with no text. */
export function emptyRichText(): RichTextBlock[] {
  return [{ spans: [] }];
}

/** All text content joined with newlines, for empty checks and labels. */
export function richTextPlainText(blocks: RichTextBlock[]): string {
  return blocks.map((block) => block.spans.map((span) => span.text).join('')).join('\n');
}

/**
 * Flattens a ProseMirror doc into blocks: every paragraph becomes one block,
 * hard breaks split a paragraph into further blocks (they render as separate
 * lines everywhere downstream). Unknown node types contribute their text
 * content, so nothing typed is silently lost.
 */
export function tiptapDocToBlocks(doc: PMNode): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  for (const node of doc.content ?? []) {
    blocks.push(...nodeToBlocks(node));
  }
  return blocks.length > 0 ? blocks : emptyRichText();
}

function nodeToBlocks(node: PMNode): RichTextBlock[] {
  const blocks: RichTextBlock[] = [{ spans: [] }];
  collectInline(node.content ?? [], blocks);
  return blocks;
}

function collectInline(nodes: PMNode[], blocks: RichTextBlock[]): void {
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      blocks.push({ spans: [] });
      continue;
    }
    if (typeof node.text === 'string' && node.text.length > 0) {
      const span: RichTextSpan = { text: node.text };
      for (const mark of node.marks ?? []) {
        const key = MARK_KEYS.find((k) => k === mark.type);
        if (key) span[key] = true;
      }
      blocks[blocks.length - 1]!.spans.push(span);
      continue;
    }
    if (node.content) collectInline(node.content, blocks);
  }
}

/** Builds the ProseMirror doc JSON that re-opens `blocks` in the editor. */
export function blocksToTiptapDoc(blocks: RichTextBlock[]): PMNode {
  const source = blocks.length > 0 ? blocks : emptyRichText();
  return {
    type: 'doc',
    content: source.map((block) => ({
      type: 'paragraph',
      ...(block.spans.length > 0
        ? {
            content: block.spans
              .filter((span) => span.text.length > 0)
              .map((span) => {
                const marks = MARK_KEYS.filter((key) => span[key]).map((type) => ({ type }));
                return {
                  type: 'text',
                  text: span.text,
                  ...(marks.length > 0 ? { marks } : {}),
                };
              }),
          }
        : {}),
    })),
  };
}
