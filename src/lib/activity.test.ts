import { describe, it, expect } from 'vitest';
import { ACTIVITY_FILTERS, activitySentence, kindTone, activityPageSchema, attentionRows, kindLabel, needsAttention, relativeTime, safeRef } from './activity';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('the activity page schema', () => {
    it('reads the documented row shape', () => {
        const page = activityPageSchema.parse({
            items: [
                {
                    id: 'run-1',
                    at: ago(30),
                    kind: 'run.failed',
                    severity: 'error',
                    actor: { kind: 'system', name: 'System' },
                    subject: { kind: 'workflow-run', id: 'run-1', title: 'Notify Slack' },
                    text: 'A workflow run failed.',
                    ref: '/workflow-runs?run=run-1',
                },
            ],
            cursor: '1_2_3_4',
            hasMore: false,
        });
        expect(page.items[0].subject?.title).toBe('Notify Slack');
    });

    it('accepts a kind it has not met and fields that are missing', () => {
        const page = activityPageSchema.parse({ items: [{ id: 'a', at: ago(1), kind: 'quota.reached' }] });
        expect(page.items[0].kind).toBe('quota.reached');
        expect(page.items[0].actor).toBeUndefined();
    });

    it('refuses a page with no items array', () => {
        expect(activityPageSchema.safeParse({ cursor: 'x' }).success).toBe(false);
    });
});

describe('kindLabel', () => {
    it('names the nine kinds and returns null for any other', () => {
        expect(kindLabel('run.failed')).toBe('Run failed');
        expect(kindLabel('type.changed')).toBe('Type changed');
        expect(kindLabel('signin')).toBe('Sign-in');
        expect(kindLabel('quota.reached')).toBeNull();
    });
});

describe('safeRef', () => {
    it('keeps a path inside the console', () => {
        expect(safeRef('/workflow-runs?run=1')).toBe('/workflow-runs?run=1');
        expect(safeRef('/x?y=1#z')).toBe('/x?y=1#z');
        expect(safeRef('/workflow-runs/abc')).toBe('/workflow-runs/abc');
    });

    it('drops anything that would leave it', () => {
        expect(safeRef('https://evil.example/x')).toBeNull();
        expect(safeRef('//evil.example/x')).toBeNull();
        expect(safeRef('/\\evil.example')).toBeNull();
        expect(safeRef('javascript:alert(1)')).toBeNull();
        expect(safeRef('/\t/evil.example')).toBeNull();
        expect(safeRef(' /x')).toBeNull();
        expect(safeRef('/x\n')).toBeNull();
        expect(safeRef('')).toBeNull();
        expect(safeRef(undefined)).toBeNull();
    });

    it('drops a path whose dot segments collapse into another host', () => {
        expect(safeRef('/.//evil.example')).toBeNull();
        expect(safeRef('/..//evil.example/x')).toBeNull();
        expect(safeRef('/a/..//evil.example')).toBeNull();
        expect(safeRef('relative/path')).toBeNull();
    });
});

describe('relativeTime', () => {
    it('reads now, minutes, hours and days', () => {
        expect(relativeTime(ago(20), NOW)).toBe('now');
        expect(relativeTime(ago(120), NOW)).toBe('2 min');
        expect(relativeTime(ago(3600), NOW)).toBe('1 h');
        expect(relativeTime(ago(3 * 86400), NOW)).toBe('3 d');
    });

    it('is empty for a time that does not parse, and never negative', () => {
        expect(relativeTime('later', NOW)).toBe('');
        expect(relativeTime(ago(-60), NOW)).toBe('now');
    });
});

describe('what needs a person', () => {
    const row = (id: string, severity: string | null) => ({ id, at: ago(10), kind: 'run.failed', severity });

    it('is a warning or an error', () => {
        expect(needsAttention({ severity: 'error' })).toBe(true);
        expect(needsAttention({ severity: 'warning' })).toBe(true);
        expect(needsAttention({ severity: 'info' })).toBe(false);
        expect(needsAttention({ severity: undefined })).toBe(false);
    });

    it('takes the newest row of an id, so a run that was retried and passed drops out', () => {
        const rows = attentionRows([row('r1', 'info'), row('r1', 'error'), row('r2', 'error'), row('r3', 'warning')]);
        expect(rows.map((r) => r.id)).toEqual(['r2', 'r3']);
    });
});

describe('the activity filter chips', () => {
    it('are Everything, Problems, Publishing, Workflow runs, Sign-ins and Imports, in that order', () => {
        expect(ACTIVITY_FILTERS.map((f) => f.label)).toEqual(['Everything', 'Problems', 'Publishing', 'Workflow runs', 'Sign-ins', 'Imports']);
    });

    it('send the kinds core filters by, and Everything sends none', () => {
        const kinds = (id: string) => ACTIVITY_FILTERS.find((f) => f.id === id)?.kinds;
        expect(kinds('all')).toEqual([]);
        expect(kinds('problems')).toEqual(['run.failed', 'bounced']);
        expect(kinds('publishing')).toEqual(['published', 'scheduled']);
        expect(kinds('runs')).toEqual(['run.succeeded', 'run.failed']);
        expect(kinds('signins')).toEqual(['signin']);
        expect(kinds('imports')).toEqual(['imported']);
    });
});

describe('activitySentence', () => {
    it('builds the sentence from kind, actor and subject title, not from text', () => {
        expect(
            activitySentence({ kind: 'published', actor: { name: 'Ana' }, subject: { title: 'New pastry menu' }, text: 'Published an entry.' }),
        ).toEqual({ actor: 'Ana', verb: 'published', subject: 'New pastry menu' });
    });

    it('names the actor System when none came', () => {
        expect(activitySentence({ kind: 'run.failed', subject: { title: 'Sunday hours' } }).actor).toBe('System');
        expect(activitySentence({ kind: 'run.failed' }).verb).toBe('failed on');
    });

    it('falls back to the API text for a kind it has no verb for', () => {
        expect(activitySentence({ kind: 'quota.reached', actor: { name: 'System' }, text: 'Something happened.' }).verb).toBe('Something happened.');
    });
});

describe('kindTone', () => {
    it('tints failures bad, bounces warn and an unknown kind muted', () => {
        expect(kindTone('run.failed')).toBe('bad');
        expect(kindTone('bounced')).toBe('warn');
        expect(kindTone('published')).toBe('ok');
        expect(kindTone('quota.reached')).toBe('muted');
    });
});
