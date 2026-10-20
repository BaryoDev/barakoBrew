import { describe, it, expect } from 'vitest';
import { SensitivityLevel, SENSITIVITY_META, contentVersionSchema, sensitivityChoices, sensitivityMeta } from './content';

const LEVELS = [SensitivityLevel.Public, SensitivityLevel.Members, SensitivityLevel.Sensitive, SensitivityLevel.Hidden];

describe('the Members sensitivity level', () => {
    it('has the wire name Members, a label and a description', () => {
        expect(SensitivityLevel.Members).toBe('Members');
        expect(SENSITIVITY_META[SensitivityLevel.Members].label).toBe('Members');
        expect(SENSITIVITY_META[SensitivityLevel.Members].description).toMatch(/viewer token/);
    });

    it('is offered against contract 9 and not against contract 8 or before the API has answered', () => {
        expect(sensitivityChoices({ kind: 'ok', version: 9 }, LEVELS)).toContain('Members');
        expect(sensitivityChoices({ kind: 'ok', version: 8 }, LEVELS)).not.toContain('Members');
        expect(sensitivityChoices({ kind: 'unknown' }, LEVELS)).not.toContain('Members');
    });

    it('stays in the list when it is the value already set', () => {
        expect(sensitivityChoices({ kind: 'ok', version: 8 }, LEVELS, 'Members')).toContain('Members');
    });
});

describe('a sensitivity the console does not know', () => {
    it('gets its own name as the label instead of throwing', () => {
        expect(sensitivityMeta('Partners').label).toBe('Partners');
        expect(sensitivityMeta('Partners').description).not.toBe('');
    });

    it('does not fail the history item that carries it', () => {
        const parsed = contentVersionSchema.safeParse({
            id: 'v1',
            changeType: 'SensitivityChanged',
            versionId: 'x',
            timestamp: '2026-10-20T00:00:00Z',
            sensitivity: 'Partners',
        });

        expect(parsed.success).toBe(true);
        expect(parsed.data?.sensitivity).toBe('Partners');
    });
});
