/**
 * Shared modal built on the native <dialog> element: focus trapping, Escape,
 * and backdrop come for free and stay accessible.
 */

import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { Icon } from '../icons';

export interface ModalProps {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}

export function Modal({ title, open, onClose, children }: ModalProps): JSX.Element | null {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
