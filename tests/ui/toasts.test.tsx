// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToasts } from '../../src/ui/toast/Toasts';

function PushOnMount({ kind, message }: { kind: 'info' | 'error'; message: string }): null {
  const toasts = useToasts();
  useEffect(() => {
    toasts.push(kind, message);
  }, [toasts, kind, message]);
  return null;
}

describe('Toasts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows pushed toasts in a polite live region', () => {
    render(
      <ToastProvider>
        <PushOnMount kind="error" message="Something failed" />
      </ToastProvider>,
    );
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('auto-dismisses after a timeout', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <PushOnMount kind="info" message="Short-lived" />
      </ToastProvider>,
    );
    expect(screen.getByText('Short-lived')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByText('Short-lived')).not.toBeInTheDocument();
  });

  it('dismisses on click', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PushOnMount kind="info" message="Click me away" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Click me away')).not.toBeInTheDocument();
  });
});
