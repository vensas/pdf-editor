// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageRef } from '../../src/pdf-core/types';
import type { TextRun } from '../../src/pdf-core/text-runs';
import {
  initialSnapshot,
  selectActiveDocument,
  useEditorStore,
} from '../../src/editor-state/store';
import type { SourceEntry } from '../../src/editor-state/types';
import { renderService } from '../../src/rendering/render-service';
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
    <AnnotationLayer
      page={page}
      displayWidth={600}
      displayHeight={800}
      zoom={1}
      sampleBackground={() => '#ffffff'}
    />,
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

describe('AnnotationLayer edit-text tool', () => {
  const runs: TextRun[] = [
    { text: 'Original line', rect: { x: 40, y: 60, width: 120, height: 14 }, fontSize: 12 },
  ];

  it('shows run hotspots and starts an in-place edit pre-filled with the text', async () => {
    vi.spyOn(renderService, 'textRuns').mockResolvedValue(runs);
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('edit-text'));

    const hotspot = await waitFor(() => {
      const el = svg.querySelector('.text-run-hotspot');
      if (!el) throw new Error('no hotspot yet');
      return el;
    });

    fireEvent.pointerDown(hotspot, { button: 0 });

    const created = Object.values(activeDoc().doc.annotations);
    expect(created).toHaveLength(1);
    expect(created[0]!.kind).toBe('text-edit');
    expect((created[0] as { text: string }).text).toBe('Original line');
    expect((created[0] as { originalText: string }).originalText).toBe('Original line');
    // Cover color came from the sampleBackground prop (#ffffff in the harness).
    expect((created[0] as { background: string }).background).toBe('#ffffff');
    // The inline editor opens, pre-filled, ready to change the words.
    expect(screen.getByPlaceholderText(/type here/i)).toHaveValue('Original line');
  });

  it('keeps an emptied text edit (redaction), unlike an empty text box', async () => {
    vi.spyOn(renderService, 'textRuns').mockResolvedValue(runs);
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('edit-text'));

    const hotspot = await waitFor(() => {
      const el = svg.querySelector('.text-run-hotspot');
      if (!el) throw new Error('no hotspot yet');
      return el;
    });
    fireEvent.pointerDown(hotspot, { button: 0 });

    const editor = screen.getByPlaceholderText(/type here/i);
    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.blur(editor);

    // The cover survives with empty text — it redacts the original.
    const annotations = Object.values(activeDoc().doc.annotations);
    expect(annotations).toHaveLength(1);
    expect((annotations[0] as { text: string }).text).toBe('');
  });
});

describe('AnnotationLayer erase tool', () => {
  it('drag-covers a region with the sampled background (empty text-edit)', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('erase'));

    // Drag a rectangle to erase.
    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { clientX: 200, clientY: 120 });
    fireEvent.pointerUp(svg);

    const created = Object.values(activeDoc().doc.annotations);
    expect(created).toHaveLength(1);
    const cover = created[0]!;
    expect(cover.kind).toBe('text-edit');
    expect((cover as { text: string }).text).toBe('');
    expect((cover as { originalText: string }).originalText).toBe('');
    // Cover color from the sampleBackground harness (#ffffff).
    expect((cover as { background: string }).background).toBe('#ffffff');
    // No inline editor opens for an erase.
    expect(screen.queryByPlaceholderText(/type here/i)).not.toBeInTheDocument();
  });

  it('ignores a too-small erase drag', () => {
    const page = setupPage();
    const svg = renderLayer(page);
    act(() => store().setTool('erase'));

    fireEvent.pointerDown(svg, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { clientX: 52, clientY: 52 });
    fireEvent.pointerUp(svg);

    expect(Object.values(activeDoc().doc.annotations)).toHaveLength(0);
  });
});
