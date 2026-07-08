/**
 * Blocking overlay with a progress bar for long-running exports. Blocking is
 * deliberate: mutating the document while the worker reads it would export a
 * state the user no longer sees.
 */

import { type JSX } from 'react';
import { useEditorStore } from '../../editor-state/store';

export function BusyOverlay(): JSX.Element | null {
  const busy = useEditorStore((state) => state.busy);
  if (!busy) return null;

  const percent = busy.progress === null ? null : Math.round(busy.progress * 100);

  return (
    <div className="busy-overlay" role="alert" aria-busy="true">
      <div className="busy-card">
        <p className="busy-label">{busy.label}…</p>
        <div
          className="busy-track"
          role="progressbar"
          aria-label={busy.label}
          {...(percent === null
            ? {}
            : { 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 })}
        >
          <div
            className={`busy-fill ${percent === null ? 'is-indeterminate' : ''}`}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        {percent !== null && <p className="muted small">{percent}%</p>}
      </div>
    </div>
  );
}
