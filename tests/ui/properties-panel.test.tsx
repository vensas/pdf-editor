// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Annotation } from '../../src/pdf-core/types';
import {
  initialSnapshot,
  selectActiveDocument,
  useEditorStore,
} from '../../src/editor-state/store';
import type { SourceEntry } from '../../src/editor-state/types';
import { PropertiesPanel } from '../../src/ui/components/PropertiesPanel';

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
  };
}

const store = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState();

const activeDoc = (): NonNullable<ReturnType<typeof selectActiveDocument>> => {
  const docState = selectActiveDocument(store());
  if (!docState) throw new Error('no active document');
  return docState;
};

beforeEach(() => {
  useEditorStore.setState({ ...initialSnapshot, recents: [] });
});

describe('PropertiesPanel', () => {
  it('shows a document summary when nothing is active', () => {
    store().addSource(makeSource('a', 3));
    render(<PropertiesPanel />);
    expect(screen.getByRole('complementary', { name: /properties/i })).toBeInTheDocument();
    expect(screen.getByText('Pages').nextElementSibling).toHaveTextContent('3');
    expect(screen.getByText(/page 1/i)).toBeInTheDocument();
    expect(screen.getByText('600 × 800 pt')).toBeInTheDocument();
  });

  it('edits the active text annotation', async () => {
    const user = userEvent.setup();
    store().addSource(makeSource('a', 1));
    const pageId = activeDoc().doc.pages[0]!.id;
    const annotation: Annotation = {
      kind: 'text',
      id: 't1',
      pageId,
      rect: { x: 0, y: 0, width: 100, height: 30 },
      text: 'Hello',
      fontSize: 16,
      color: '#112233',
    };
    store().addAnnotation(annotation);

    render(<PropertiesPanel />);
    expect(screen.getByRole('heading', { name: 'Text' })).toBeInTheDocument();

    const textField = screen.getByLabelText('Text');
    await user.type(textField, '!');
    expect((activeDoc().doc.annotations['t1'] as { text: string }).text).toBe('Hello!');

    const sizeField = screen.getByLabelText(/font size/i);
    await user.clear(sizeField);
    await user.type(sizeField, '24');
    expect((activeDoc().doc.annotations['t1'] as { fontSize: number }).fontSize).toBe(24);
  });

  it('deletes the active annotation', async () => {
    const user = userEvent.setup();
    store().addSource(makeSource('a', 1));
    const pageId = activeDoc().doc.pages[0]!.id;
    store().addAnnotation({
      kind: 'highlight',
      id: 'h1',
      pageId,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      color: '#ffd43b',
      opacity: 0.5,
    });

    render(<PropertiesPanel />);
    await user.click(screen.getByRole('button', { name: /delete annotation/i }));
    expect(activeDoc().doc.annotations['h1']).toBeUndefined();
  });
});
