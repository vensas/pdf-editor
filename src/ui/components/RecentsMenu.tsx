/**
 * Toolbar dropdown listing documents closed earlier in this session.
 * Reopening replaces an untouched starter sheet, otherwise it adds the
 * pages to the current document. Hidden while there is nothing to show.
 */

import { useState, type JSX } from 'react';
import { useEditorStore } from '../../editor-state/store';
import { reopenRecent } from '../../services/open-files';
import { useToasts } from '../toast/Toasts';
import { Icon } from '../icons';

export function RecentsMenu(): JSX.Element | null {
  const recents = useEditorStore((state) => state.recents);
  const removeRecent = useEditorStore((state) => state.removeRecent);
  const [open, setOpen] = useState(false);
  const toasts = useToasts();

  if (recents.length === 0) return null;

  return (
    <div className="menu-anchor">
      <button
        type="button"
        className="tool-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="clock" />
        <span>Recent</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="menu-backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div role="menu" aria-label="Recent documents" className="menu-popover">
            {recents.map((recent) => (
              <div key={recent.id} className="menu-item-row">
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    void reopenRecent(recent)
                      .then(() => toasts.push('success', `Reopened ${recent.name}.`))
                      .catch((error: unknown) =>
                        toasts.push(
                          'error',
                          error instanceof Error
                            ? error.message
                            : 'Could not reopen this document.',
                        ),
                      );
                  }}
                >
                  <span className="recent-name">{recent.name}</span>
                  <span className="muted small">
                    {recent.pageCount} page{recent.pageCount === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Forget ${recent.name}`}
                  onClick={() => removeRecent(recent.id)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            <p className="muted small menu-footnote">
              Kept in memory only for this tab — closing it forgets everything.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
