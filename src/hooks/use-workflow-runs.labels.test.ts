import { describe, expect, it } from 'vitest';
import { attemptLabel, runEntryLabel, workflowRunSchema } from './use-workflow-runs';

const base = { contentType: 'article', contentId: '11111111-2222-3333-4444-555555555555' };

describe('runEntryLabel', () => {
  it('uses the title core sends', () => {
    expect(runEntryLabel({ ...base, contentTitle: 'Rainy-day menu' })).toBe('Rainy-day menu');
  });

  it('falls back to the type and the first eight characters of the id', () => {
    expect(runEntryLabel({ ...base })).toBe('article 11111111');
    expect(runEntryLabel({ ...base, contentTitle: null })).toBe('article 11111111');
    expect(runEntryLabel({ ...base, contentTitle: '   ' })).toBe('article 11111111');
  });
});

describe('attemptLabel', () => {
  it('returns the workflow label, trimmed, or null when there is none', () => {
    expect(attemptLabel({ label: ' Post to Slack ' })).toBe('Post to Slack');
    expect(attemptLabel({ label: null })).toBeNull();
    expect(attemptLabel({})).toBeNull();
  });
});

describe('the run schema', () => {
  const run = {
    id: 'r1',
    workflowDefinitionId: 'w1',
    workflowName: 'Notify',
    contentId: base.contentId,
    contentType: 'article',
    triggerEvent: 'ContentPublished',
    status: 'Failed',
    createdAt: '2026-09-03T10:00:00Z',
    actions: [{ ordinal: 1, actionType: 'Webhook', status: 'Failed', attempts: 1 }],
  };

  it('keeps contentTitle and an action label', () => {
    const parsed = workflowRunSchema.parse({
      ...run,
      contentTitle: 'Rainy-day menu',
      actions: [{ ...run.actions[0], label: 'Post to Slack' }],
    });
    expect(parsed.contentTitle).toBe('Rainy-day menu');
    expect(parsed.actions[0].label).toBe('Post to Slack');
  });

  it('still parses a run from an API that sends neither', () => {
    const parsed = workflowRunSchema.parse(run);
    expect(parsed.contentTitle).toBeUndefined();
    expect(parsed.actions[0].label).toBeUndefined();
  });
});
