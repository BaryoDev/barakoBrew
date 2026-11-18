import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

let items: Record<string, unknown>[] = [];
vi.mock('@/hooks/use-workflow-runs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-workflow-runs')>()),
  useWorkflowRuns: () => ({ data: { items }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const { RecentRuns } = await import('./recent-runs');

function row(extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    workflowDefinitionId: 'w1',
    workflowName: 'Notify',
    contentId: '11111111-2222-3333-4444-555555555555',
    contentType: 'article',
    triggerEvent: 'ContentPublished',
    status: 'Running',
    createdAt: '2026-09-03T10:00:00Z',
    actions: [],
    ...extra,
  };
}

describe('Recent runs', () => {
  it('shows the entry title when core sends one', () => {
    items = [row({ contentTitle: 'Rainy-day menu' })];
    render(<RecentRuns workflowId="w1" />);
    expect(screen.getByText('Rainy-day menu')).toBeInTheDocument();
    expect(screen.queryByText('article 11111111')).toBeNull();
  });

  it('falls back to the type and id8 when no title is sent', () => {
    items = [row()];
    render(<RecentRuns workflowId="w1" />);
    expect(screen.getByText('article 11111111')).toBeInTheDocument();
  });

  it('pulses the dot of a Running run', () => {
    items = [row()];
    const { container } = render(<RecentRuns workflowId="w1" />);
    expect(container.querySelector('.pulse')).not.toBeNull();
  });
});
