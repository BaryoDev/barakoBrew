import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WorkflowExecutionLog } from '@/types/workflow';

const useWorkflowDebugLogs = vi.fn();
vi.mock('@/hooks/use-workflows', () => ({
  useWorkflowDebugLogs: (id: string) => useWorkflowDebugLogs(id),
}));

// The run list. The tests below that are about the debug log run with the list refused, which is
// how an API before barakoCMS#1165 or a caller without the capability reaches that panel.
const useWorkflowRuns = vi.fn();
vi.mock('@/hooks/use-workflow-runs', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-workflow-runs')>('@/hooks/use-workflow-runs');
  return { ...actual, useWorkflowRuns: (...args: unknown[]) => useWorkflowRuns(...args) };
});

const { AxiosError, AxiosHeaders } = await import('axios');
const { RunsPanel } = await import('./runs-panel');

function refused(status: number) {
  return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function listRun(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workflowDefinitionId: 'wf-1',
    workflowName: 'Announce',
    contentId: 'c-1',
    contentType: 'post',
    triggerEvent: 'Created',
    status: 'Succeeded',
    createdAt: '2026-09-03T10:15:00Z',
    actions: [],
    ...extra,
  };
}

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
    useWorkflowRuns.mockReset();
    useWorkflowRuns.mockReturnValue({ isLoading: false, isError: true, error: refused(404), data: undefined });
  });

  describe('from the run list', () => {
    it('asks for this workflow only and links each run to the runs page', () => {
      useWorkflowRuns.mockReturnValue({
        isLoading: false,
        isError: false,
        data: { items: [listRun('r-1'), listRun('r-2', { status: 'Failed' })] },
      });
      render(<RunsPanel workflowId="wf-1" />);

      expect(useWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'wf-1' }));
      const links = within(screen.getByRole('list', { name: 'Recent runs' })).getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', '/workflow-runs?run=r-1');
      expect(links[1]).toHaveAttribute('href', '/workflow-runs?run=r-2');
      expect(links[1]).toHaveTextContent('Failed');
      expect(useWorkflowDebugLogs).not.toHaveBeenCalled();
    });

    it('shows the debug log, not the empty message, when the list holds another workflow run', () => {
      useWorkflowRuns.mockReturnValue({
        isLoading: false,
        isError: false,
        data: { items: [listRun('r-9', { workflowDefinitionId: 'wf-2' })] },
      });
      useWorkflowDebugLogs.mockReturnValue({ data: [], isLoading: false });
      render(<RunsPanel workflowId="wf-1" />);

      expect(useWorkflowDebugLogs).toHaveBeenCalledWith('wf-1');
      expect(screen.queryByRole('link')).toBeNull();
    });

    it('says the workflow has not run when the list is empty', () => {
      useWorkflowRuns.mockReturnValue({ isLoading: false, isError: false, data: { items: [] } });
      render(<RunsPanel workflowId="wf-1" />);

      expect(screen.getByText(/This workflow has not run yet/)).toBeInTheDocument();
    });

    it('shows an error with a retry for a failure that is not a refusal, not the debug log', () => {
      const refetch = vi.fn();
      useWorkflowRuns.mockReturnValue({ isLoading: false, isError: true, error: refused(500), refetch });
      render(<RunsPanel workflowId="wf-1" />);

      expect(screen.getByRole('alert')).toHaveTextContent('The runs could not be read.');
      expect(useWorkflowDebugLogs).not.toHaveBeenCalled();
    });

    it('falls back to the debug log on a 403', () => {
      useWorkflowRuns.mockReturnValue({ isLoading: false, isError: true, error: refused(403) });
      useWorkflowDebugLogs.mockReturnValue({ data: [], isLoading: false });
      render(<RunsPanel workflowId="wf-1" />);

      expect(useWorkflowDebugLogs).toHaveBeenCalledWith('wf-1');
    });
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
