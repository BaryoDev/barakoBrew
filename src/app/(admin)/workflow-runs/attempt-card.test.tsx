import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttemptCard } from './attempt-card';
import type { WorkflowActionAttempt } from '@/hooks/use-workflow-runs';

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const QUESTION = 'This failure will not fix itself by retrying. Retry anyway?';

function attempt(overrides: Partial<WorkflowActionAttempt> = {}): WorkflowActionAttempt {
  return {
    ordinal: 2,
    actionType: 'Webhook',
    status: 'Failed',
    attempts: 3,
    durationMs: 1240,
    responseStatus: 503,
    error: 'Service Unavailable',
    completedAt: null,
    nextAttemptAt: null,
    ...overrides,
  };
}

function renderCard(a: WorkflowActionAttempt, onRetry = vi.fn(), retrying = false) {
  render(
    <ol>
      <AttemptCard attempt={a} onRetry={onRetry} retrying={retrying} />
    </ol>,
  );
  return onRetry;
}

describe('AttemptCard', () => {
  it('offers a retry on a failed action and reports the ordinal it belongs to', () => {
    const onRetry = renderCard(attempt());

    fireEvent.click(screen.getByRole('button', { name: /retry action 2/i }));

    // The ordinal, not the array index. The endpoint addresses the action by ordinal, so sending
    // the wrong one retries a different action than the one the operator pressed.
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('offers a retry on an unknown action, the timeout only a person can judge', () => {
    renderCard(attempt({ status: 'Unknown', error: 'The request timed out.' }));

    expect(screen.getByRole('button', { name: /retry action 2/i })).toBeInTheDocument();
  });

  it('does not offer a retry on a succeeded action', () => {
    // The hazard the idempotency key exists for: retrying a succeeded action sends it a second
    // time. The UI must not put the button on screen at all.
    renderCard(attempt({ status: 'Succeeded', error: null, responseStatus: 200 }));

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('does not offer a retry while the action is running', () => {
    renderCard(attempt({ status: 'Running', error: null, responseStatus: null }));

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('does not offer a retry on an action that is already queued or was skipped', () => {
    renderCard(attempt({ status: 'Pending', error: null, responseStatus: null }));
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    renderCard(attempt({ ordinal: 3, status: 'Skipped', error: null, responseStatus: null }));
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('disables the button while a retry is in flight, so it cannot be pressed twice', () => {
    renderCard(attempt(), vi.fn(), true);

    expect(screen.getByRole('button', { name: /retry action 2/i })).toBeDisabled();
  });

  it('shows the attempt count, the duration and the response status', () => {
    renderCard(attempt());

    expect(screen.getByText('Attempts')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1.2 s')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
  });

  it('shows the error when there is one', () => {
    renderCard(attempt({ error: 'Connection refused by hooks.example.com' }));

    expect(screen.getByText('Connection refused by hooks.example.com')).toBeInTheDocument();
  });

  it('leaves out the rows for facts the run does not carry', () => {
    renderCard(attempt({ responseStatus: null, completedAt: null, nextAttemptAt: null }));

    // A label with nothing under it reads as missing data rather than as a fact that does not apply.
    expect(screen.queryByText('Response')).not.toBeInTheDocument();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    expect(screen.queryByText('Next attempt')).not.toBeInTheDocument();
  });

  it('shows when the next automatic attempt is due', () => {
    renderCard(attempt({ status: 'Pending', nextAttemptAt: '2026-09-03T10:15:00Z' }));

    expect(screen.getByText('Next attempt')).toBeInTheDocument();
  });

  it('labels a failed action the API calls retryable as Temporary and retries it without asking', () => {
    const onRetry = renderCard(attempt({ retryable: true }));

    expect(screen.getByText('Temporary')).toBeInTheDocument();
    expect(screen.queryByText('Permanent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry action 2/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('labels a failed action the API calls not retryable as Permanent and asks before retrying it', async () => {
    const onRetry = renderCard(attempt({ retryable: false }));

    expect(screen.getByText('Permanent')).toBeInTheDocument();
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry action 2/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(QUESTION);
    expect(onRetry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry anyway' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('retries nothing when the question is cancelled', async () => {
    const onRetry = renderCard(attempt({ retryable: false }));

    fireEvent.click(screen.getByRole('button', { name: /retry action 2/i }));
    await screen.findByRole('alertdialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('shows neither label and retries without asking when the API sent no retryable', () => {
    // An older API. Treating the missing field as permanent would make every failure on it look
    // permanent and put a question in front of every retry.
    for (const [ordinal, retryable] of [[7, undefined], [8, null]] as const) {
      const onRetry = renderCard(attempt({ ordinal, retryable }));

      fireEvent.click(screen.getByRole('button', { name: new RegExp(`retry action ${ordinal}`, 'i') }));

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(ordinal);
    }

    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
    expect(screen.queryByText('Permanent')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('labels only a failed action, even when another status carries retryable', () => {
    const others = ['Succeeded', 'Skipped', 'Running', 'Pending', 'Unknown'];
    others.forEach((status, i) => renderCard(attempt({ ordinal: 10 + i, status, retryable: false })));

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText('Permanent')).not.toBeInTheDocument();
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
  });

  it('retries a timeout without the permanent question, whatever retryable holds', () => {
    const onRetry = renderCard(attempt({ status: 'Unknown', retryable: false }));

    fireEvent.click(screen.getByRole('button', { name: /retry action 2/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps an error that looks like markup as text', () => {
    renderCard(attempt({ retryable: false, error: '<img src=x onerror=alert(1)><b>bold</b>' }));

    expect(screen.getByText('<img src=x onerror=alert(1)><b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('li img')).toBeNull();
    expect(document.querySelector('li b')).toBeNull();
  });
});
