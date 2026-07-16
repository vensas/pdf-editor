/**
 * Inline rich text editor for rich-text annotations, backed by Tiptap.
 * Mounted absolutely over the annotation's rect while editing; converts the
 * editor's ProseMirror JSON to RichTextBlocks on every change and hands them
 * to the store via onChange.
 *
 * Only features the PDF bake can reproduce are enabled: paragraphs, hard
 * breaks, and bold/italic/underline/strikethrough marks.
 */

import { useEffect, useRef, type JSX } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { blocksToTiptapDoc, tiptapDocToBlocks, type PMNode } from '../../pdf-core/rich-text';
import type { RichTextAnnotation, RichTextBlock } from '../../pdf-core/types';
import { TEXT_PADDING, textLineHeight } from '../../pdf-core/text-metrics';
import { Icon, type IconName } from '../icons';

export interface RichTextEditorProps {
  annotation: RichTextAnnotation;
  zoom: number;
  onChange(blocks: RichTextBlock[]): void;
  onDone(): void;
}

const MARKS: { mark: 'bold' | 'italic' | 'underline' | 'strike'; icon: IconName; label: string }[] =
  [
    { mark: 'bold', icon: 'formatBold', label: 'Bold (⌘/Ctrl+B)' },
    { mark: 'italic', icon: 'formatItalic', label: 'Italic (⌘/Ctrl+I)' },
    { mark: 'underline', icon: 'formatUnderline', label: 'Underline (⌘/Ctrl+U)' },
    { mark: 'strike', icon: 'formatStrike', label: 'Strikethrough' },
  ];

export function RichTextEditor({
  annotation,
  zoom,
  onChange,
  onDone,
}: RichTextEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // The bake only understands paragraphs and inline marks — disable
        // everything it would silently flatten.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: false,
      }),
    ],
    content: blocksToTiptapDoc(annotation.blocks),
    onUpdate: ({ editor: instance }) => {
      onChange(tiptapDocToBlocks(instance.getJSON() as PMNode));
    },
  });

  // Focus once the browser has finished the triggering click's own focus
  // handling — a synchronous autofocus would be blurred right back by it
  // and the focusout guard would close the editor immediately.
  useEffect(() => {
    if (!editor) return undefined;
    const raf = requestAnimationFrame(() => editor.commands.focus('end'));
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  // Close when focus leaves the whole widget (content and toolbar alike);
  // focusout bubbles, unlike blur.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onFocusOut = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
      onDone();
    };
    container.addEventListener('focusout', onFocusOut);
    return () => container.removeEventListener('focusout', onFocusOut);
  }, [onDone]);

  const { rect, fontSize, color } = annotation;

  return (
    <div
      ref={containerRef}
      className="rich-text-editor"
      style={{
        left: rect.x * zoom,
        top: rect.y * zoom,
        width: rect.width * zoom,
        minHeight: rect.height * zoom,
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDone();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        {MARKS.map(({ mark, icon, label }) => (
          <MarkButton key={mark} editor={editor} mark={mark} icon={icon} label={label} />
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="rich-text-content"
        style={{
          fontSize: fontSize * zoom,
          lineHeight: `${textLineHeight(fontSize) * zoom}px`,
          padding: TEXT_PADDING * zoom,
          color,
        }}
      />
    </div>
  );
}

function MarkButton({
  editor,
  mark,
  icon,
  label,
}: {
  editor: Editor | null;
  mark: 'bold' | 'italic' | 'underline' | 'strike';
  icon: IconName;
  label: string;
}): JSX.Element {
  const active =
    useEditorState({
      editor,
      selector: (context) => context.editor?.isActive(mark) ?? false,
    }) ?? false;
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'is-on' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // preventDefault keeps focus in the editor so toggling doesn't blur it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor?.chain().focus().toggleMark(mark).run()}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
