import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function open(cancelLabel?: string) {
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      trigger={<button type="button">Open</button>}
      title="Sure?"
      description="Really."
      confirmLabel="Yes"
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  return onConfirm;
}

describe('ConfirmDialog cancel label', () => {
  it('says Cancel unless told otherwise', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('says what the caller asked for and backs out without confirming', async () => {
    const onConfirm = open('Keep it');
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
