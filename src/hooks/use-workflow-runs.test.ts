import { describe, expect, it } from 'vitest';
import {
  ANY_STATUS,
  failureKind,
  formatDuration,
  isAbandonable,
  isCancellable,
  isRunId,
  parseRunId,
  isRetryable,
  isStopped,
  runAllowsRetry,
  runFailureKind,
  runListParams,
  workflowRunSchema,
  toneForAttemptStatus,
  toneForRunStatus,
} from './use-workflow-runs';

describe('runListParams', () => {
  it('always sends a bounded page, so the list cannot be asked for everything', () => {
    expect(runListParams({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('sends the status when one is chosen', () => {
    expect(runListParams({ status: 'Failed' })).toEqual({ page: 1, pageSize: 25, status: 'Failed' });
  });

  it('leaves the status out for "every status", which the API has no name for', () => {
    // Not status: 'all'. The endpoint refuses a status it cannot parse with a 400 rather than
    // dropping the filter, so sending this would turn "show me everything" into an error.
    expect(runListParams({ status: ANY_STATUS })).toEqual({ page: 1, pageSize: 25 });
  });

  it('leaves out a blank or whitespace status for the same reason', () => {
    expect(runListParams({ status: '' })).toEqual({ page: 1, pageSize: 25 });
    expect(runListParams({ status: '   ' })).toEqual({ page: 1, pageSize: 25 });
  });

  it('sends contentId when one is set and leaves it out when it is not', () => {
    expect(runListParams({ contentId: 'abc' })).toEqual({ page: 1, pageSize: 25, contentId: 'abc' });
    expect(runListParams({ contentId: '  ' })).toEqual({ page: 1, pageSize: 25 });
  });

  it('carries the page and page size through', () => {
    expect(runListParams({ page: 4, pageSize: 10, status: 'Running' })).toEqual({
      page: 4,
      pageSize: 10,
      status: 'Running',
    });
  });
});

describe('isRetryable', () => {
  it('offers a retry on a failed action', () => {
    expect(isRetryable({ status: 'Failed' })).toBe(true);
  });

  it('offers a retry on an unknown action, which is the timeout an operator has to judge', () => {
    expect(isRetryable({ status: 'Unknown' })).toBe(true);
  });

  it('never offers a retry on a succeeded action', () => {
    // The hazard the idempotency key exists for. The endpoint answers 409, so offering the button
    // could only produce an error toast, and the action would be sent twice if it did not.
    expect(isRetryable({ status: 'Succeeded' })).toBe(false);
  });

  it('never offers a retry on an action that is still running or already queued', () => {
    expect(isRetryable({ status: 'Running' })).toBe(false);
    expect(isRetryable({ status: 'Pending' })).toBe(false);
  });

  it('never offers a retry on a skipped action, whose condition was evaluated and not met', () => {
    expect(isRetryable({ status: 'Skipped' })).toBe(false);
  });

  it('refuses a status it does not recognise rather than guessing', () => {
    expect(isRetryable({ status: 'Quarantined' })).toBe(false);
  });
});

describe('formatDuration', () => {
  it('says nothing was recorded rather than printing a number for an absent duration', () => {
    expect(formatDuration(null)).toBe('not recorded');
    expect(formatDuration(undefined)).toBe('not recorded');
  });

  it('says nothing was recorded for a value no clock could produce', () => {
    expect(formatDuration(-1)).toBe('not recorded');
    expect(formatDuration(Number.NaN)).toBe('not recorded');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('not recorded');
  });

  it('keeps sub-second work in milliseconds', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(42)).toBe('42 ms');
    expect(formatDuration(999)).toBe('999 ms');
  });

  it('switches to tenths of a second at a second', () => {
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(1240)).toBe('1.2 s');
    expect(formatDuration(30500)).toBe('30.5 s');
  });

  it('rolls into minutes rather than printing a sixty-second second', () => {
    // 59,950 ms is under a minute, and one decimal place rounds it to "60.0 s", which is a duration
    // no clock shows. The guard is on the rounded value for exactly this input.
    expect(formatDuration(59_950)).toBe('1m 0s');
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(252_000)).toBe('4m 12s');
  });
});

describe('toneForRunStatus', () => {
  it('tints a partly failed run as a warning, not as a failure', () => {
    // Some of the actions went out. Colouring it the same as Failed tells an operator to retry a
    // run whose first two actions already posted.
    expect(toneForRunStatus('PartiallyFailed')).toBe('warning');
    expect(toneForRunStatus('Failed')).toBe('destructive');
  });

  it('tints the settled and in-flight states apart', () => {
    expect(toneForRunStatus('Succeeded')).toBe('success');
    expect(toneForRunStatus('Running')).toBe('accent');
    expect(toneForRunStatus('Pending')).toBe('muted');
  });

  it('falls back to muted for a status this build has not heard of', () => {
    expect(toneForRunStatus('Abandoned')).toBe('muted');
  });
});

describe('toneForAttemptStatus', () => {
  it('tints an unknown attempt as a warning, since it is neither a success nor a proven failure', () => {
    expect(toneForAttemptStatus('Unknown')).toBe('warning');
  });

  it('tints the rest by outcome', () => {
    expect(toneForAttemptStatus('Succeeded')).toBe('success');
    expect(toneForAttemptStatus('Failed')).toBe('destructive');
    expect(toneForAttemptStatus('Running')).toBe('accent');
    expect(toneForAttemptStatus('Pending')).toBe('muted');
    expect(toneForAttemptStatus('Skipped')).toBe('muted');
  });
});

describe('failureKind', () => {
  it('reads retryable true on a failed action as temporary', () => {
    expect(failureKind({ status: 'Failed', retryable: true })).toBe('temporary');
  });

  it('reads retryable false on a failed action as permanent', () => {
    expect(failureKind({ status: 'Failed', retryable: false })).toBe('permanent');
  });

  it('says nothing when the API sent no retryable, or sent null', () => {
    // An API older than 4.2.0 leaves the field out, and a newer one sends null for a failure
    // recorded before it was kept. Reading either as permanent would put a confirmation in front of
    // every retry on an older API.
    expect(failureKind({ status: 'Failed' })).toBeNull();
    expect(failureKind({ status: 'Failed', retryable: null })).toBeNull();
    expect(failureKind({ status: 'Failed', retryable: undefined })).toBeNull();
  });

  it('says nothing about an action that did not fail, whatever retryable holds', () => {
    const others = ['Pending', 'Running', 'Succeeded', 'Unknown', 'Skipped'];
    expect(others).toHaveLength(5);

    for (const status of others) {
      expect(failureKind({ status, retryable: false })).toBeNull();
      expect(failureKind({ status, retryable: true })).toBeNull();
    }
  });

  it('does not read a value that is not a boolean as either kind', () => {
    const odd = { status: 'Failed', retryable: 'false' as unknown as boolean };
    expect(failureKind(odd)).toBeNull();
  });
});

describe('runFailureKind', () => {
  const failed = (retryable?: boolean | null) => ({ status: 'Failed', retryable });

  it('is permanent when any failed action is permanent, whatever order they come in', () => {
    expect(runFailureKind({ actions: [failed(true), failed(false)] })).toBe('permanent');
    expect(runFailureKind({ actions: [failed(false), failed(true)] })).toBe('permanent');
  });

  it('is temporary when every failed action that says is temporary', () => {
    expect(runFailureKind({ actions: [failed(true), failed(null), { status: 'Succeeded' }] })).toBe('temporary');
  });

  it('says nothing for a run whose failures carry no retryable', () => {
    expect(runFailureKind({ actions: [failed(), failed(null)] })).toBeNull();
  });

  it('says nothing for a run with no failed action, or no actions at all', () => {
    expect(runFailureKind({ actions: [{ status: 'Succeeded', retryable: false }] })).toBeNull();
    expect(runFailureKind({ actions: [] })).toBeNull();
  });
});

describe('isCancellable', () => {
  it('is true for a waiting or running run on an API that can cancel', () => {
    expect(isCancellable({ status: 'Pending', cancelledAt: null })).toBe(true);
    expect(isCancellable({ status: 'Running', cancelledAt: null })).toBe(true);
  });

  it('is false for a finished run', () => {
    for (const status of ['Succeeded', 'Failed', 'PartiallyFailed', 'Cancelled']) {
      expect(isCancellable({ status, cancelledAt: null })).toBe(false);
    }
  });

  it('is false once someone has stopped the run, even while an action is still out', () => {
    expect(isCancellable({ status: 'Running', cancelledAt: '2026-10-03T10:00:00Z' })).toBe(false);
  });

  it('is false on an API before 4.6, which sends no cancelledAt and has no cancel route', () => {
    expect(isCancellable({ status: 'Pending' })).toBe(false);
  });
});

describe('isStopped', () => {
  it('is true for a cancelled run and for one cancelled with an action still out', () => {
    expect(isStopped({ status: 'Cancelled' })).toBe(true);
    expect(isStopped({ status: 'Running', cancelledAt: '2026-10-03T10:00:00Z' })).toBe(true);
  });

  it('is false for a run nobody stopped', () => {
    expect(isStopped({ status: 'Failed', cancelledAt: null })).toBe(false);
    expect(isStopped({ status: 'Failed' })).toBe(false);
  });
});

describe('runAllowsRetry', () => {
  it('allows a retry on a failed run nobody stopped or rolled back', () => {
    expect(runAllowsRetry({ status: 'Failed', cancelledAt: null, compensation: null, abandonedAt: null })).toBe(true);
    expect(runAllowsRetry({ status: 'Failed' })).toBe(true);
  });

  it('refuses a run being rolled back or rolled back, which contract 8 answers 409', () => {
    for (const compensation of ['Compensating', 'Compensated', 'Incomplete']) {
      expect(runAllowsRetry({ status: 'PartiallyFailed', cancelledAt: null, compensation })).toBe(false);
    }
    expect(runAllowsRetry({ status: 'Failed', abandonedAt: '2026-10-13T10:00:00Z' })).toBe(false);
  });

  it('refuses a stopped run, as before', () => {
    expect(runAllowsRetry({ status: 'Cancelled' })).toBe(false);
  });
});

describe('workflowRunSchema', () => {
  const run = {
    id: 'r1',
    workflowDefinitionId: 'w1',
    workflowName: 'Notify',
    contentId: 'c1',
    contentType: 'post',
    triggerEvent: 'Created',
    status: 'PartiallyFailed',
    createdAt: '2026-10-13T10:00:00Z',
    actions: [{ ordinal: 1, actionType: 'Webhook', status: 'Succeeded', attempts: 1 }],
  };

  it('reads a run as contract 8 sends it, with its rollback and each action undone', () => {
    const parsed = workflowRunSchema.parse({
      ...run,
      executor: null,
      abandonedAt: '2026-10-13T11:00:00Z',
      compensation: 'Incomplete',
      actions: [
        {
          ...run.actions[0],
          outputs: { orderId: '42' },
          compensation: { actionType: 'Webhook', status: 'NotDeclared', attempts: 0 },
        },
      ],
    });

    expect(parsed.compensation).toBe('Incomplete');
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].outputs).toEqual({ orderId: '42' });
    expect(parsed.actions[0].compensation?.status).toBe('NotDeclared');
  });

  it('still reads a run from an API before contract 8, which sends none of it', () => {
    const parsed = workflowRunSchema.parse(run);

    expect(parsed.compensation).toBeUndefined();
    expect(parsed.actions).toHaveLength(1);
  });

  it('refuses an action compensation without a status, rather than showing an empty one', () => {
    expect(() =>
      workflowRunSchema.parse({ ...run, actions: [{ ...run.actions[0], compensation: { attempts: 0 } }] }),
    ).toThrow();
  });
});

describe('isAbandonable', () => {
  const ok = { action: (status: string) => ({ ordinal: 1, actionType: 'Webhook', status, attempts: 1 }) };

  it('offers it on a run where something went out and the rest did not', () => {
    expect(
      isAbandonable({ status: 'PartiallyFailed', cancelledAt: null, actions: [ok.action('Succeeded'), ok.action('Failed')] }),
    ).toBe(true);
  });

  it('does not offer it when nothing succeeded, since there is nothing to undo', () => {
    expect(isAbandonable({ status: 'Failed', cancelledAt: null, actions: [ok.action('Failed')] })).toBe(false);
  });

  it('does not offer it on a run that finished with everything succeeded', () => {
    expect(isAbandonable({ status: 'Succeeded', cancelledAt: null, actions: [ok.action('Succeeded')] })).toBe(false);
  });

  it('does not offer it on a cancelled run or one already rolled back', () => {
    const actions = [ok.action('Succeeded'), ok.action('Failed')];
    expect(isAbandonable({ status: 'Cancelled', cancelledAt: '2026-10-19T10:00:00Z', actions })).toBe(false);
    expect(isAbandonable({ status: 'Failed', cancelledAt: null, compensation: 'Compensating', actions })).toBe(false);
    expect(isAbandonable({ status: 'Failed', cancelledAt: null, abandonedAt: '2026-10-19T10:00:00Z', actions })).toBe(false);
  });
});

describe('a run read with the attempt history', () => {
  const base = {
    id: 'r1',
    workflowDefinitionId: 'wf',
    workflowName: 'Announce',
    contentId: 'c',
    contentType: 'article',
    triggerEvent: 'Created',
    status: 'Failed',
    createdAt: '2026-10-19T10:00:00Z',
  };

  it('keeps every try and the dropped count', () => {
    const parsed = workflowRunSchema.parse({
      ...base,
      updatedAt: '2026-10-19T10:01:00Z',
      actions: [
        {
          ordinal: 1,
          actionType: 'Webhook',
          status: 'Failed',
          attempts: 3,
          droppedAttempts: 2,
          history: [
            { number: 4, outcome: 'Failed', responseStatus: 503, error: 'bad gateway', retryable: true, durationMs: 120 },
            { number: 5, outcome: 'Succeeded' },
          ],
        },
      ],
    });

    expect(parsed.updatedAt).toBe('2026-10-19T10:01:00Z');
    expect(parsed.actions[0].history).toHaveLength(2);
    expect(parsed.actions[0].history?.[0].number).toBe(4);
    expect(parsed.actions[0].droppedAttempts).toBe(2);
  });

  it('still reads a run from an API without it', () => {
    const parsed = workflowRunSchema.parse({
      ...base,
      actions: [{ ordinal: 1, actionType: 'Webhook', status: 'Failed', attempts: 1 }],
    });

    expect(parsed.actions[0].history).toBeUndefined();
    expect(parsed.updatedAt).toBeUndefined();
  });
});

describe('parseRunId', () => {
  const canonical = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it.each([
    canonical,
    canonical.toUpperCase(),
    `{${canonical}}`,
    `(${canonical})`,
    canonical.replaceAll('-', ''),
    `  ${canonical}\n`,
    `{${canonical.toUpperCase()}}`,
  ])('reads %j as the canonical id', (text) => {
    expect(parseRunId(text)).toBe(canonical);
  });

  it.each(['abc', '..', '', `{${canonical}`, `${canonical})`, `[${canonical}]`, `${canonical}0`, canonical.slice(1)])(
    'refuses %j',
    (text) => {
      expect(parseRunId(text)).toBeNull();
    },
  );
});

describe('isRunId', () => {
  it('accepts the spellings of a GUID that parseRunId reads, and nothing else', () => {
    expect(isRunId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isRunId('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(true);
    for (const text of ['abc', '..', '', 'run-1', '3f2504e0-4f89-11d3-9a0c-0305e82c33010', '../3f2504e0-4f89-11d3-9a0c-0305e82c3301']) {
      expect(isRunId(text), text).toBe(false);
    }
  });
});

describe('a run with a status this console does not know', () => {
  it('parses, and keeps the status as it came', () => {
    const parsed = workflowRunSchema.parse({
      id: 'r1',
      workflowDefinitionId: 'w',
      workflowName: 'W',
      contentId: 'c',
      contentType: 't',
      triggerEvent: 'Created',
      status: 'Abandoned',
      createdAt: '2026-10-19T10:00:00Z',
      actions: [],
    });

    expect(parsed.status).toBe('Abandoned');
  });
});
