/**
 * Right-side properties panel: contextual controls for the active annotation,
 * otherwise a summary of the current selection / active page.
 */

import { useMemo, type JSX } from 'react';
import { textBoxHeight } from '../../pdf-core/text-metrics';
import type { Annotation } from '../../pdf-core/types';
import { computeDisplayInfo } from '../../editor-state/selectors';
import { useEditorStore } from '../../editor-state/store';
import { useActiveDoc } from '../hooks/useActiveDoc';
import { Icon } from '../icons';

export function PropertiesPanel(): JSX.Element {
  const annotation = useActiveDoc((docState) =>
    docState.activeAnnotationId ? docState.doc.annotations[docState.activeAnnotationId] : undefined,
  );

  return (
    <aside className="properties-panel" aria-label="Properties">
      {annotation ? <AnnotationProperties annotation={annotation} /> : <ContextSummary />}
    </aside>
  );
}

const KIND_LABELS: Record<Annotation['kind'], string> = {
  text: 'Text',
  'text-edit': 'Edited text',
  ink: 'Freehand drawing',
  image: 'Image',
  highlight: 'Highlight',
  shape: 'Shape',
};

function AnnotationProperties({ annotation }: { annotation: Annotation }): JSX.Element {
  const updateAnnotation = useEditorStore((state) => state.updateAnnotation);
  const deleteAnnotation = useEditorStore((state) => state.deleteAnnotation);

  const label =
    annotation.kind === 'shape' ? `Shape · ${annotation.shape}` : KIND_LABELS[annotation.kind];

  return (
    <div className="panel-section">
      <h2>{label}</h2>

      {(annotation.kind === 'text' || annotation.kind === 'text-edit') && (
        <>
          <label className="field">
            <span>Text</span>
            <textarea
              rows={annotation.kind === 'text-edit' ? 2 : 4}
              value={annotation.text}
              onChange={(event) => {
                const text = event.target.value;
                updateAnnotation(annotation.id, {
                  text,
                  // Text boxes grow to fit; text edits keep the run's box.
                  ...(annotation.kind === 'text'
                    ? {
                        rect: {
                          ...annotation.rect,
                          height: Math.max(
                            annotation.rect.height,
                            textBoxHeight(annotation.fontSize, text.split('\n').length),
                          ),
                        },
                      }
                    : {}),
                });
              }}
            />
          </label>
          <label className="field">
            <span>Font size</span>
            {/* Uncontrolled so the field can be cleared while typing; only
                valid values reach the store. */}
            <input
              key={annotation.id}
              type="number"
              min={6}
              max={96}
              defaultValue={annotation.fontSize}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value)) {
                  updateAnnotation(annotation.id, {
                    fontSize: Math.min(Math.max(value, 6), 96),
                  });
                }
              }}
            />
          </label>
        </>
      )}

      {annotation.kind === 'text-edit' && (
        <label className="field">
          <span>Cover color</span>
          <input
            type="color"
            value={annotation.background}
            aria-label="Cover color"
            onChange={(event) =>
              updateAnnotation(annotation.id, { background: event.target.value })
            }
          />
        </label>
      )}

      {'color' in annotation && (
        <label className="field">
          <span>Color</span>
          <input
            type="color"
            value={annotation.color}
            onChange={(event) => updateAnnotation(annotation.id, { color: event.target.value })}
          />
        </label>
      )}

      {(annotation.kind === 'ink' || annotation.kind === 'shape') && (
        <label className="field">
          <span>Stroke width</span>
          <input
            type="range"
            min={0.5}
            max={12}
            step={0.5}
            value={annotation.strokeWidth}
            onChange={(event) =>
              updateAnnotation(annotation.id, { strokeWidth: Number(event.target.value) })
            }
          />
        </label>
      )}

      {annotation.kind === 'highlight' && (
        <label className="field">
          <span>Opacity</span>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={annotation.opacity}
            onChange={(event) =>
              updateAnnotation(annotation.id, { opacity: Number(event.target.value) })
            }
          />
        </label>
      )}

      {annotation.kind === 'shape' &&
        (annotation.shape === 'rectangle' || annotation.shape === 'ellipse') && (
          <div className="field">
            <span>Fill</span>
            <div className="field-row">
              <input
                type="color"
                value={annotation.fill ?? '#ffffff'}
                aria-label="Fill color"
                onChange={(event) => updateAnnotation(annotation.id, { fill: event.target.value })}
              />
              <button
                type="button"
                className="link-button"
                disabled={annotation.fill === undefined}
                onClick={() => updateAnnotation(annotation.id, { fill: undefined })}
              >
                No fill
              </button>
            </div>
          </div>
        )}

      <button
        type="button"
        className="tool-button is-danger"
        onClick={() => deleteAnnotation(annotation.id)}
      >
        <Icon name="trash" />
        <span>Delete annotation</span>
      </button>
      <p className="muted small">
        Annotations are flattened into the PDF when you export. Move or resize them on the page;
        double-click text to edit it inline.
      </p>
    </div>
  );
}

function ContextSummary(): JSX.Element {
  const selectionCount = useActiveDoc((docState) => docState.selection.length) ?? 0;
  const pages = useActiveDoc((docState) => docState.doc.pages) ?? [];
  const activePageId = useActiveDoc((docState) => docState.activePageId) ?? null;
  const annotationCount =
    useActiveDoc((docState) => Object.keys(docState.doc.annotations).length) ?? 0;
  const docName = useActiveDoc((docState) => docState.docName) ?? 'Untitled';
  const sources = useEditorStore((state) => state.sources);

  const activeIndex = pages.findIndex((page) => page.id === activePageId);
  const activePage = activeIndex >= 0 ? pages[activeIndex] : undefined;
  const pageInfo = activePage
    ? sources[activePage.sourceId]?.pageInfos[activePage.sourceIndex]
    : undefined;
  const display = useMemo(
    () => (activePage ? computeDisplayInfo(pageInfo, activePage.rotation) : null),
    [activePage, pageInfo],
  );
  const sourceName = activePage ? sources[activePage.sourceId]?.name : undefined;

  return (
    <div className="panel-section">
      <h2 className="panel-doc-title" title={docName}>
        {docName}
      </h2>
      <dl className="facts">
        <dt>Pages</dt>
        <dd>{pages.length}</dd>
        <dt>Selected</dt>
        <dd>{selectionCount === 0 ? 'None' : selectionCount}</dd>
        <dt>Annotations</dt>
        <dd>{annotationCount}</dd>
        <dt>Sources</dt>
        <dd>{Object.keys(sources).length}</dd>
      </dl>

      {activePage && display && (
        <>
          <h2>Page {activeIndex + 1}</h2>
          <dl className="facts">
            <dt>Size</dt>
            <dd>
              {Math.round(display.width)} × {Math.round(display.height)} pt
            </dd>
            <dt>Rotation</dt>
            <dd>{activePage.rotation}°</dd>
            {sourceName && (
              <>
                <dt>From</dt>
                <dd className="fact-file" title={sourceName}>
                  {sourceName}
                </dd>
              </>
            )}
          </dl>
        </>
      )}

      <p className="muted small">
        Pick a tool in the toolbar to annotate, or select pages in the sidebar to rearrange, rotate,
        duplicate, extract, or delete them. Everything stays on your device.
      </p>
    </div>
  );
}
