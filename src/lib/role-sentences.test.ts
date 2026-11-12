import { describe, it, expect } from 'vitest';
import type { ContentTypePermission } from '@/types/rbac';
import { emptyPermission } from '@/types/rbac';
import { roleSentences } from './role-sentences';

const schemas = [{ name: 'absence', displayName: 'Absence' }];
const base = (patch: Partial<ContentTypePermission>): ContentTypePermission => ({ ...emptyPermission('absence'), ...patch });
const texts = (permissions: ContentTypePermission[], capabilities: string[] = [], roleName = 'Editor') =>
    roleSentences({ roleName, permissions, capabilities, schemas }).map((s) => s.text);

describe('roleSentences', () => {
    it('says nothing for an empty role', () => {
        expect(texts([])).toEqual([]);
    });

    it('groups plain actions on one type into one sentence', () => {
        expect(texts([base({ create: { enabled: true }, read: { enabled: true }, update: { enabled: true } })])).toEqual([
            'Editor can create, read and update every Absence.',
        ]);
    });

    it('gives an action with a condition its own sentence', () => {
        const out = texts([base({ read: { enabled: true, conditions: { CreatedBy: { _eq: '$CURRENT_USER' } } }, update: { enabled: true } })]);
        expect(out).toContain('Editor can update every Absence.');
        expect(out).toContain('Editor can read Absence where CreatedBy is the current user.');
    });

    it('reads a transition with and without a condition', () => {
        const out = texts([
            base({
                transitions: {
                    Approve: { enabled: true },
                    Reject: { enabled: true, conditions: { Department: { _in: ['HR', 'Ops'] } } },
                    Explain: { enabled: false },
                },
            }),
        ]);
        expect(out).toEqual([
            'Editor can run Approve on every Absence.',
            'Editor can run Reject on Absence where Department is one of HR, Ops.',
        ]);
    });

    it('reads readable and writable field sets', () => {
        const out = texts([
            base({
                read: { enabled: true, readableFields: ['Name', 'Grade'] },
                update: { enabled: true, writableFields: ['Grade'] },
            }),
        ]);
        expect(out).toContain('Editor sees only Name and Grade on Absence.');
        expect(out).toContain('Editor can set only Grade when they update Absence.');
    });

    it('ignores a field set on a rule that is off', () => {
        expect(texts([base({ read: { enabled: false, readableFields: ['Name'] } })])).toEqual([]);
    });

    it('reads capabilities by label, and an unlisted one by name', () => {
        expect(texts([], ['manage_users', 'upload_files'])).toEqual([
            'Editor can manage user accounts.',
            'Editor holds the upload_files capability.',
        ]);
    });

    it('calls an unnamed role This role', () => {
        expect(texts([base({ read: { enabled: true } })], [], '  ')).toEqual(['This role can read every Absence.']);
    });
});
