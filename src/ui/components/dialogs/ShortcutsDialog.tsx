/**
 * Keyboard shortcuts reference.
 */

import { type JSX } from 'react';
import { Modal } from '../Modal';

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; shortcuts: [string, string][] }[] = [
  {
    title: 'General',
    shortcuts: [
      [`${MOD}+Z`, 'Undo'],
      [`Shift+${MOD}+Z`, 'Redo'],
      [`${MOD}+A`, 'Select all pages'],
      [`${MOD}+P`, 'Print the edited document'],
      ['Esc', 'Deselect / back to Select tool'],
      ['?', 'Show this dialog'],
    ],
  },
  {
    title: 'Pages',
    shortcuts: [
      ['← / →', 'Previous / next page'],
      ['[ / ]', 'Rotate left / right'],
      [`${MOD}+D`, 'Duplicate selected pages'],
      ['Del / ⌫', 'Delete selected pages'],
      ['Shift+Click', 'Select a range of pages'],
      [`${MOD}+Click`, 'Add page to selection'],
    ],
  },
  {
    title: 'Tools',
    shortcuts: [
      ['V', 'Select'],
      ['E', 'Edit existing text'],
      ['X', 'Remove object (image/graphic)'],
      ['T', 'Text'],
      ['B', 'Rich text'],
      ['P', 'Draw (pen)'],
      ['H', 'Highlight'],
      ['R', 'Rectangle'],
      ['O', 'Ellipse'],
      ['L', 'Line'],
      ['A', 'Arrow'],
      ['Del / ⌫', 'Delete active annotation'],
    ],
  },
];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return (
    <Modal title="Keyboard shortcuts" open={open} onClose={onClose}>
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl className="shortcut-list">
              {group.shortcuts.map(([keys, description]) => (
                <div key={keys + description} className="shortcut-row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
