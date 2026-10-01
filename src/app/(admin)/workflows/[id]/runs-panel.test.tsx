import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WorkflowExecutionLog } from '@/types/workflow';

const useWorkflowDebugLogs = vi.fn();
vi.mock('@/hooks/use-workflows', () => ({
  useWorkflowDebugLogs: (id: string) => useWorkflowDebugLogs(id),
}));

const { RunsPanel } = await import('./runs-panel');

const NOTE = 'Redacted: credentials and exception messages are not stored.';

function log(id: string, extra: Partial<WorkflowExecutionLog> = {}): WorkflowExecutionLog {
  return {
    id,
    workflowId: 'wf-1',
    contentId: 'c-1',
    executedAt: '2026-09-03T10:15:00Z',
    isDryRun: false,
    success: false,
    duration: '00:00:01.2000000',
    actions: [
      {
        actionType: 'Webhook',
        success: false,
        errorMessage: 'HttpRequestException',
        resolvedParameters: { Url: '[redacted]' },
        duration: '00:00:01.2000000',
      },
    ],
    ...extra,
  };
}

function renderPanel(logs: WorkflowExecutionLog[]) {
  useWorkflowDebugLogs.mockReturnValue({ data: logs, isLoading: false });
  render(<RunsPanel workflowId="wf-1" />);
  // The children, not every listitem: each log holds a nested list of its actions.
  return Array.from(screen.getByRole('list', { name: 'Recent runs' }).children) as HTMLElement[];
}

describe('RunsPanel', () => {
  beforeEach(() => {
    useWorkflowDebugLogs.mockReset();
  });

  it('marks a log the API calls redacted and says once what is not stored', () => {
    const entries = renderPanel([log('a', { redacted: true }), log('b', { redacted: true })]);

    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByText('Redacted')).toBeInTheDocument();
    expect(within(entries[1]).getByText('Redacted')).toBeInTheDocument();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
  });

  it('marks only the redacted log when the list holds both kinds', () => {
    const entries = renderPanel([log('a', { redacted: false }), log('b', { redacted: true })]);

    expect(entries).toHaveLength(2);
    expect(within(entries[0]).queryByText('Redacted')).not.toBeInTheDocument();
    expect(within(entries[1]).getByText('Redacted')).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('shows no mark and no note when no log is redacted', () => {
    const entries = renderPanel([log('a', { redacted: false })]);

    expect(entries).toHaveLength(1);
    expect(screen.queryByText('Redacted')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('shows the panel as before for an API that sends no redacted field', () => {
    const entries = renderPanel([log('a')]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent('Webhook: HttpRequestException');
    expect(screen.queryByText('Redacted')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('keeps an error that looks like markup as text', () => {
    const entries = renderPanel([
      log('a', {
        redacted: true,
        actions: [
          {
            actionType: 'Webhook',
            success: false,
            errorMessage: '<img src=x onerror=alert(1)>',
            resolvedParameters: {},
            duration: '00:00:00',
          },
        ],
      }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent('Webhook: <img src=x onerror=alert(1)>');
    expect(entries[0].querySelector('img')).toBeNull();
  });

  it('still says a workflow has not run when there are no logs', () => {
    useWorkflowDebugLogs.mockReturnValue({ data: [], isLoading: false });
    render(<RunsPanel workflowId="wf-1" />);

    expect(screen.getByText(/This workflow has not run yet/)).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
