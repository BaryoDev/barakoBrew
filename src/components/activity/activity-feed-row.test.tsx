import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ActivityFeedRow } from './activity-feed-row';
import { ACTIVITY_KINDS, countByFilter, ACTIVITY_FILTERS, matchesFilter, relativeTime, safeRef } from '@/lib/activity';
import type { ActivityRow } from '@/types/activity';

const NOW = Date.parse('2026-11-01T12:00:00Z');

function row(kind: string, extra: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: `id-${kind}`,
    at: '2026-11-01T11:55:00Z',
    kind,
    severity: 'info',
    actor: { kind: 'user', name: 'Mara' },
    subject: { kind: 'content', id: 'c-1', title: 'Spring menu' },
    text: 'did something',
    ref: '/content/c-1',
    ...extra,
  };
}

const EXPECTED: [string, string][] = [
  ['published', 'published'],
  ['scheduled', 'scheduled'],
  ['edited', 'edited'],
  ['run.succeeded', 'ran successfully on'],
  ['run.failed', 'failed to run on'],
  ['bounced', 'had an email bounce for'],
  ['signin', 'signed in'],
  ['imported', 'imported'],
  ['type.changed', 'changed the content type'],
];

describe('an activity row', () => {
  it('covers exactly the nine kinds the API names', () => {
    expect(Object.keys(ACTIVITY_KINDS).sort()).toEqual(EXPECTED.map(([kind]) => kind).sort());
  });

  it.each(EXPECTED)('renders a %s row with its sentence, age, chip and link', (kind, sentence) => {
    render(<ul><ActivityFeedRow row={row(kind)} now={NOW} /></ul>);

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent(`Mara ${sentence} Spring menu`);
    expect(within(item).getByText('5m ago')).toBeInTheDocument();
    const chip = item.querySelector('[data-slot="badge"]');
    expect(chip).toHaveTextContent(kind);
    expect(item.querySelector('code')).toBeNull();
    expect(within(item).getByRole('link', { name: 'Spring menu' })).toHaveAttribute('href', '/content/c-1');
    expect(item).toHaveClass('h-12');
  });

  it('shows an unknown kind as its name in mono with the sentence the API sent', () => {
    render(<ul><ActivityFeedRow row={row('thing.happened', { text: 'moved a thing' })} now={NOW} /></ul>);

    const item = screen.getByRole('listitem');
    const name = within(item).getByText('thing.happened');
    expect(name.tagName).toBe('CODE');
    expect(name).toHaveClass('font-mono');
    expect(item).toHaveTextContent('Mara moved a thing Spring menu');
  });

  it('does not link a ref that leaves the console', () => {
    render(<ul><ActivityFeedRow row={row('edited', { ref: 'https://elsewhere.example/x' })} now={NOW} /></ul>);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('Mara edited Spring menu');
  });

  it('leaves the subject out when the row has none', () => {
    render(
      <ul>
        <ActivityFeedRow row={row('signin', { subject: { kind: '', id: '', title: '' }, ref: '' })} now={NOW} />
      </ul>,
    );

    expect(screen.getByRole('listitem').textContent).toContain('Mara signed in');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('activity filters', () => {
  const rows = [
    row('published'),
    row('scheduled'),
    row('run.failed', { severity: 'error' }),
    row('run.succeeded'),
    row('bounced', { severity: 'warning' }),
    row('signin'),
    row('imported'),
    row('type.changed', { severity: 'warning' }),
    row('edited'),
  ];

  it('counts each chip from the loaded rows', () => {
    const counts = countByFilter(rows);
    expect(counts).toEqual({ all: 9, problems: 3, publishing: 2, runs: 2, signins: 1, imports: 1 });
  });

  it('keeps a warning of any kind under Problems', () => {
    const problems = ACTIVITY_FILTERS.find((f) => f.id === 'problems')!;
    const kept = rows.filter((r) => matchesFilter(r, problems)).map((r) => r.kind);
    expect(kept).toEqual(['run.failed', 'bounced', 'type.changed']);
  });
});

describe('activity helpers', () => {
  it('words an age', () => {
    expect(relativeTime('2026-11-01T11:59:50Z', NOW)).toBe('just now');
    expect(relativeTime('2026-11-01T09:00:00Z', NOW)).toBe('3h ago');
    expect(relativeTime('2026-10-29T12:00:00Z', NOW)).toBe('3d ago');
    expect(relativeTime('not a date', NOW)).toBe('');
  });

  it('links only paths inside the console', () => {
    expect(safeRef('/content/1')).toBe('/content/1');
    expect(safeRef('//elsewhere.example')).toBeNull();
    expect(safeRef('javascript:void(0)')).toBeNull();
  });

  it('does not link a path a browser reads as another host', () => {
    expect(safeRef('/\\evil.example')).toBeNull();
    expect(safeRef('/\t/evil.example')).toBeNull();
    expect(safeRef('/\n/evil.example')).toBeNull();
    expect(safeRef('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example');
    expect(safeRef('/content/1?tab=history#top')).toBe('/content/1?tab=history#top');
  });
});
