/**
 * Split-by-ranges dialog: "1-3, 5, 8-10" — each group opens as its own new
 * document tab, ready to review, edit, and export.
 */

import { useState, type JSX } from 'react';
import { splitIntoDocuments } from '../../../services/export-service';
import { useActiveDoc } from '../../hooks/useActiveDoc';
import { useToasts } from '../../toast/Toasts';
import { Modal } from '../Modal';

export function SplitDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const [ranges, setRanges] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pageCount = useActiveDoc((docState) => docState.doc.pages.length) ?? 0;
  const toasts = useToasts();

  const submit = (): void => {
    setError(null);
    try {
      const count = splitIntoDocuments(ranges);
      toasts.push(
        'success',
        `Split into ${count} document${count === 1 ? '' : 's'} — see the new tab${count === 1 ? '' : 's'} above.`,
      );
      setRanges('');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    }
  };

  return (
    <Modal title="Split into new documents" open={open} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>Ranges (document has {pageCount} pages)</span>
          <input
            type="text"
            value={ranges}
            placeholder="e.g. 1-3, 5, 8-10"
            autoFocus
            onChange={(event) => setRanges(event.target.value)}
            aria-describedby="split-hint"
          />
        </label>
        <p id="split-hint" className="muted small">
          Each comma-separated range becomes its own document tab — nothing is downloaded until you
          export a tab. Ranges refer to the current page order, including your edits; annotations
          travel with their pages.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="tool-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="tool-button is-primary" disabled={ranges.trim() === ''}>
            Split
          </button>
        </div>
      </form>
    </Modal>
  );
}
