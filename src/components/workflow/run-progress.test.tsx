import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunProgressStrip, progressSummary, segmentTone } from './run-progress';

const step = (status: string, nextAttemptAt: string | null = null) => ({ status, nextAttemptAt });

describe('the run progress strip', () => {
  it('draws one segment per action, coloured by its outcome', () => {
    render(<RunProgressStrip actions={[step('Succeeded'), step('Failed'), step('Unknown'), step('Skipped')]} />);

    const segments = screen.getAllByTestId('progress-segment');
    expect(segments).toHaveLength(4);
    expect(segments[0]).toHaveClass('bg-success');
    expect(segments[1]).toHaveClass('bg-destructive');
    expect(segments[2]).toHaveClass('bg-warning');
    expect(segments[3]).toHaveClass('bg-border');
  });

  it('colours a failed action that is waiting to be tried again as a warning, not a failure', () => {
    expect(segmentTone(step('Failed', '2026-10-01T10:00:00Z'))).toBe('bg-warning');
    expect(segmentTone(step('Failed'))).toBe('bg-destructive');
  });

  it('has a text name for a reader who cannot see the colours', () => {
    render(<RunProgressStrip actions={[step('Succeeded'), step('Succeeded'), step('Failed')]} />);

    expect(screen.getByRole('img', { name: '3 actions: 2 succeeded, 1 failed' })).toBeInTheDocument();
    expect(progressSummary([step('Running')])).toBe('1 action: 1 running');
  });

  it('draws nothing for a run with no actions', () => {
    const { container } = render(<RunProgressStrip actions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
