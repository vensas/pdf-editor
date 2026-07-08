// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialSnapshot, useEditorStore } from '../../src/editor-state/store';
import { RecentsMenu } from '../../src/ui/components/RecentsMenu';
import { ToastProvider } from '../../src/ui/toast/Toasts';

beforeEach(() => {
  useEditorStore.setState({ ...initialSnapshot, recents: [] });
});

function renderMenu(): void {
  render(
    <ToastProvider>
      <RecentsMenu />
    </ToastProvider>,
  );
}

describe('RecentsMenu', () => {
  it('renders nothing while there are no recents', () => {
    renderMenu();
    expect(screen.queryByRole('button', { name: /recent/i })).not.toBeInTheDocument();
  });

  it('lists recent documents in a dropdown', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      recents: [
        { id: 'r1', name: 'contract.pdf', pageCount: 12, bytes: new Uint8Array([1]), closedAt: 1 },
      ],
    });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /recent/i }));
    expect(screen.getByRole('menu', { name: /recent documents/i })).toBeInTheDocument();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText('12 pages')).toBeInTheDocument();
  });

  it('lets the user forget a recent document', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      recents: [
        { id: 'r1', name: 'contract.pdf', pageCount: 12, bytes: new Uint8Array([1]), closedAt: 1 },
      ],
    });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /recent/i }));
    await user.click(screen.getByRole('button', { name: /forget contract\.pdf/i }));
    expect(useEditorStore.getState().recents).toHaveLength(0);
  });
});
