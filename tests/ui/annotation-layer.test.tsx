// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PageRef } from '../../src/pdf-core/types';
import {
  initialSnapshot,
  selectActiveDocument,
  useEditorStore,
} from '../../src/editor-state/store';
import type { SourceEntry } from '../../src/editor-state/types';
import { AnnotationLayer } from '../../src/ui/components/AnnotationLayer';

function makeSource(id: string, pageCount: number): SourceEntry {
  return {
    id,
    name: `${id}.pdf`,
    bytes: new Uint8Array([1]),
    pageCount,
    pageInfos: Array.from({ length: pageCount }, () => ({
      width: 600,
      height: 800,
      rotate: 0 as const,
    })),
    origin: 'file',
  };
}

const store = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState();

const activeDoc = (): NonNullable<ReturnType<typeof selectActiveDocument>> => {
  const docState = selectActiveDocument(store());
  if (!docState) throw new Error('no active document');
  return docState;
};

function setupPage(): PageRef {
  store().addSource(makeSource('a', 1));
  return activeDoc().doc.pages[0]!;
}

function renderLayer(page: PageRef): SVGSVGElement {
  const { container } = render(
    <AnnotationLayer page={page} displayWidth={600} displayHeight={800} zoom={1} />,
  );
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no svg');
  return svg;
}

beforeEach(() => {
  useEditorStore.setState({ ...initialSnapshot, recents: [] });
});

describe('AnnotationLayer text tool', () => {
  it('creates a text annotation on click and opens the inline editor', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('text'));

    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 60 });

    const created = Object.values(activeDoc().doc.annotations);
    expect(created).toHaveLength(1);
    expect(created[0]!.kind).toBe('text');
    // The inline editor is open and the tool has returned to select.
    expect(screen.getByPlaceholderText(/type here/i)).toBeInTheDocument();
    expect(store().tool).toBe('select');
  });

  it('keeps the annotation when text was entered before blur', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('text'));
    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 60 });

    const editor = screen.getByPlaceholderText(/type here/i);
    fireEvent.change(editor, { target: { value: 'Approved' } });
    fireEvent.blur(editor);

    const annotations = Object.values(activeDoc().doc.annotations);
    expect(annotations).toHaveLength(1);
    expect((annotations[0] as { text: string }).text).toBe('Approved');
    expect(screen.queryByPlaceholderText(/type here/i)).not.toBeInTheDocument();
  });

  it('discards the annotation when the editor closes empty', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('text'));
    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 60 });

    fireEvent.blur(screen.getByPlaceholderText(/type here/i));
    expect(Object.values(activeDoc().doc.annotations)).toHaveLength(0);
  });

  it('prevents the pointerdown default so the browser cannot blur the new editor', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('text'));

    // fireEvent returns false when preventDefault() was called.
    const notPrevented = fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 60 });
    expect(notPrevented).toBe(false);
  });

  it('reopens the editor on double-click of an existing text annotation', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('text'));
    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 60 });
    const editor = screen.getByPlaceholderText(/type here/i);
    fireEvent.change(editor, { target: { value: 'Hello' } });
    fireEvent.blur(editor);

    const group = svg.querySelector('g.annotation');
    expect(group).not.toBeNull();
    fireEvent.doubleClick(group!);
    expect(screen.getByPlaceholderText(/type here/i)).toHaveValue('Hello');
  });
});
