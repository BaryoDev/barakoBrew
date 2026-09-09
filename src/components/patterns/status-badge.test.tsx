import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

/**
 * The tones are measured pairs, so what matters is which tokens a tone actually paints with.
 *
 * The bug that produced the measurements is recorded in the component: the tints used to be an
 * alpha wash with `--warning-foreground` on top, which is white, so a warning badge was white on a
 * wash of white and nothing caught it. A test on the class pair is the cheap half of not repeating
 * that. The axe gate in e2e is the other half.
 */
describe('the status badge tones', () => {
  it('paints each tone with the ink and ground its pair names', () => {
    const pairs = [
      ['success', 'bg-[var(--success-soft)]', 'text-success'],
      ['warning', 'bg-[var(--warning-soft)]', 'text-warning'],
      ['muted', 'bg-secondary', 'text-secondary-foreground'],
      ['destructive', 'bg-[var(--danger-soft)]', 'text-destructive'],
      ['accent', 'bg-accent', 'text-accent-foreground'],
      ['subtle', 'bg-secondary', 'text-muted-foreground'],
    ] as const;

    for (const [tone, ground, ink] of pairs) {
      const { unmount } = render(<StatusBadge tone={tone}>{tone}</StatusBadge>);
      const badge = screen.getByText(tone);

      expect(badge.className).toContain(ground);
      expect(badge.className).toContain(ink);

      unmount();
    }
  });

  it('gives Archived a quieter ink than Draft on the same ground', () => {
    // Both greys sit on the sunken tint and the design separates them by ink alone, so the two
    // tones are only distinguishable by the text colour. A refactor that collapsed subtle into
    // muted would still pass a background assertion.
    render(
      <>
        <StatusBadge tone="muted">Draft</StatusBadge>
        <StatusBadge tone="subtle">Archived</StatusBadge>
      </>
    );

    expect(screen.getByText('Draft').className).toContain('text-secondary-foreground');
    expect(screen.getByText('Archived').className).toContain('text-muted-foreground');
  });
});
