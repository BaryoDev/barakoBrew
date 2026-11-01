import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthTiles } from './health-tiles';
import type { WorkflowHealth } from '@/hooks/use-workflow-health';

function health(extra: Partial<WorkflowHealth> = {}): WorkflowHealth {
  return {
    workflowId: 'wf-1',
    name: 'Announce',
    enabled: true,
    lastOutcomes: [],
    successRate: 0.75,
    finishedRuns: 8,
    averageActionDurationMs: 1500,
    ...extra,
  };
}

describe('HealthTiles', () => {
  it('shows runs here, succeeded percent and average action time', () => {
    render(<HealthTiles health={health()} windowDays={30} />);

    expect(screen.getByText('Runs here').nextElementSibling).toHaveTextContent('8');
    expect(screen.getByText('Succeeded %').nextElementSibling).toHaveTextContent('75%');
    expect(screen.getByText('Avg. action').nextElementSibling).toHaveTextContent('1.5 s');
    expect(screen.getByText('last 30 days')).toBeInTheDocument();
  });

  it('says there are no runs rather than 0% when nothing finished', () => {
    render(<HealthTiles health={health({ successRate: null, finishedRuns: 0, averageActionDurationMs: null })} />);

    expect(screen.getByText('Succeeded %').nextElementSibling).toHaveTextContent('No runs yet');
    expect(screen.getByText('Avg. action').nextElementSibling).toHaveTextContent('Not recorded');
  });

  it('renders nothing when there is no health answer for the workflow', () => {
    const { container } = render(<HealthTiles health={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });
});
