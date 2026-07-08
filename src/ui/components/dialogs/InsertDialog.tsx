/**
 * Insert-from-PDF dialog: choose another PDF and where its pages go.
 */

import { useRef, useState, type JSX } from 'react';
import { openFiles } from '../../../services/open-files';
import { useActiveDoc } from '../../hooks/useActiveDoc';
import { useToasts } from '../../toast/Toasts';
import { Modal } from '../Modal';

export function InsertDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const pageCount = useActiveDoc((docState) => docState.doc.pages.length) ?? 0;
  const [position, setPosition] = useState<number>(pageCount);
  const [error, setError] = useState<string | null>(null);
  const toasts = useToasts();

  const submit = (): void => {
    if (!file) return;
    setError(null);
    const insertAt = Math.max(0, Math.min(position, pageCount));
    void openFiles([file], { mode: 'merge', insertAt })
      .then((result) => {
        const failure = result.errors[0];
        if (failure) {
          setError(failure.message);
          return;
        }
        toasts.push(
          'success',
          `Inserted ${result.openedPages} page${result.openedPages === 1 ? '' : 's'} at position ${insertAt + 1}.`,
        );
        setFile(null);
        onClose();
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Something went wrong.'),
      );
  };

  return (
    <Modal title="Insert pages from another PDF" open={open} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <span>PDF file</span>
          <div className="field-row">
            <button type="button" className="tool-button" onClick={() => fileRef.current?.click()}>
              Choose PDF…
            </button>
            <span className="muted small">{file ? file.name : 'No file selected'}</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </div>
        <label className="field">
          <span>Insert before page (1–{pageCount + 1})</span>
          <input
            type="number"
            min={1}
            max={pageCount + 1}
            value={position + 1}
            onChange={(event) => setPosition(Number(event.target.value) - 1)}
          />
        </label>
        <p className="muted small">
          Use {pageCount + 1} to append at the end. You can also just “Add PDF” and drag the new
          pages wherever you want them.
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
          <button type="submit" className="tool-button is-primary" disabled={!file}>
            Insert
          </button>
        </div>
      </form>
    </Modal>
  );
}
