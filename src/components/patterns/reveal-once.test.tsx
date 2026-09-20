import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { toast } = await import('sonner');
const { RevealOnce } = await import('./reveal-once');

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('RevealOnce', () => {
  it('shows a single secret in a named field and says it cannot be shown again', () => {
    render(<RevealOnce title="Copy your API key" secret="bcms_SECRET" secretLabel="API key" />);

    expect(screen.getByRole('textbox', { name: 'API key' })).toHaveValue('bcms_SECRET');
    expect(screen.getByText(/it cannot be shown again/)).toBeInTheDocument();
  });

  it('shows several secrets as a named list, in the plural', () => {
    render(<RevealOnce title="Save your recovery codes" secret={['aa-11', 'bb-22']} secretLabel="Recovery codes" />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items.map((li) => li.textContent)).toEqual(['aa-11', 'bb-22']);
    expect(screen.getByRole('list', { name: 'Recovery codes' })).toBeInTheDocument();
    expect(screen.getByText(/they cannot be shown again/)).toBeInTheDocument();
  });

  it('copies a single secret as it stands and several joined by newlines', async () => {
    const { unmount } = render(<RevealOnce title="One" secret="only-one" secretLabel="Key" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('only-one'));
    unmount();

    render(<RevealOnce title="Many" secret={['aa-11', 'bb-22']} secretLabel="Codes" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('aa-11\nbb-22'));
  });

  it('says so when the clipboard refuses, instead of claiming it copied', async () => {
    writeText.mockRejectedValue(new Error('denied'));

    render(<RevealOnce title="One" secret="only-one" secretLabel="Key" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('It could not be copied. Select it and copy it by hand.'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('renders a dismiss button only when there is something to dismiss to', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<RevealOnce title="One" secret="s" secretLabel="Key" />);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();

    rerender(<RevealOnce title="One" secret="s" secretLabel="Key" dismissLabel="Done" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('holds nothing of its own, so a remount after the caller clears the secret shows nothing', () => {
    const { rerender } = render(<RevealOnce title="One" secret="gone-now" secretLabel="Key" />);
    expect(screen.getByRole('textbox', { name: 'Key' })).toHaveValue('gone-now');

    rerender(<div />);

    expect(screen.queryByRole('textbox', { name: 'Key' })).toBeNull();
    expect(document.body.textContent).not.toContain('gone-now');
  });
});
