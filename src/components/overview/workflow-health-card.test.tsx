import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

let workflows: { id: string; name: string; enabled?: boolean; triggerContentType: string; triggerEvent: string }[];
let health: Record<string, unknown>;

vi.mock('@/hooks/use-workflows', () => ({ useWorkflows: () => ({ data: workflows, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/hooks/use-workflow-health', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/use-workflow-health')>('@/hooks/use-workflow-health');
    return {
        ...actual,
        useWorkflowHealth: () => ({ unavailable: false, isError: false, error: null, refetch: vi.fn(), healthOf: (id: string) => health[id] }),
    };
});

const { WorkflowHealthCard, barStyle, rateTone } = await import('./workflow-health-card');

const wf = (id: string, enabled = true) => ({ id, name: `Flow ${id}`, enabled, triggerContentType: 'post', triggerEvent: 'Published' });
const outcome = (runId: string, status: string, minute: number) => ({
    runId,
    status,
    createdAt: new Date(Date.UTC(2026, 9, 21, 12, minute)).toISOString(),
});

beforeEach(() => {
    workflows = [wf('a'), wf('b', false)];
    health = {
        a: {
            workflowId: 'a',
            lastOutcomes: [outcome('r1', 'Succeeded', 1), outcome('r2', 'Failed', 2)],
            successRate: 0.5,
            finishedRuns: 2,
        },
    };
});

describe('the Workflow health card', () => {
    it('lists active workflows only', () => {
        render(<WorkflowHealthCard />);
        expect(screen.getByText('Flow a')).toBeInTheDocument();
        expect(screen.queryByText('Flow b')).toBeNull();
    });

    it('opens the latest run of a workflow', () => {
        render(<WorkflowHealthCard />);
        expect(screen.getByRole('link', { name: /Flow a/ })).toHaveAttribute('href', '/workflow-runs?run=r2');
    });

    it('draws each outcome at the design height and colour', () => {
        expect(barStyle('Succeeded')).toEqual({ tone: 'bg-success', height: 22 });
        expect(barStyle('Failed')).toEqual({ tone: 'bg-destructive', height: 18 });
        expect(barStyle('PartiallyFailed')).toEqual({ tone: 'bg-warning', height: 18 });
        expect(barStyle('Running')).toEqual({ tone: 'bg-primary', height: 14 });
        expect(barStyle('Cancelled')).toEqual({ tone: 'bg-border', height: 14 });
        render(<WorkflowHealthCard />);
        const bars = within(screen.getByRole('img', { name: 'Last 2 runs' })).getAllByTitle(/Succeeded|Failed/);
        expect(bars.map((b) => b.style.height)).toEqual(['22px', '18px']);
    });

    it('colours the rate at 90 and 70', () => {
        expect(rateTone(90)).toBe('text-success');
        expect(rateTone(89)).toBe('text-warning');
        expect(rateTone(70)).toBe('text-warning');
        expect(rateTone(69)).toBe('text-destructive');
        render(<WorkflowHealthCard />);
        expect(screen.getByText('50%').className).toContain('text-destructive');
    });
});
