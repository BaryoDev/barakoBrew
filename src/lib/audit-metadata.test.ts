import { describe, it, expect } from 'vitest';
import { auditDetails } from './audit-metadata';

const capped = (items: unknown[], count = items.length) => ({ items, count, truncated: count > items.length });

function line(details: ReturnType<typeof auditDetails>, label: string): string[] | undefined {
    return details.find((d) => d.label === label)?.lines;
}

describe('audit entry details', () => {
    it('pairs a membership entry role ids with their names, before and after', () => {
        const details = auditDetails({
            roleIds: ['r-1', 'r-2'],
            roleNames: ['Admin', ''],
            previousStatus: 'Suspended',
            previousRoleIds: ['r-3'],
            previousRoleNames: ['Editor'],
        });

        expect(line(details, 'Roles')).toEqual(['Admin (r-1), deleted role (r-2)']);
        expect(line(details, 'Roles before')).toEqual(['Editor (r-3)']);
        expect(line(details, 'Status before')).toEqual(['Suspended']);
    });

    it('says how many a capped role list left out', () => {
        const ids = Array.from({ length: 50 }, () => '');
        const names = Array.from({ length: 50 }, (_, i) => `role${i}`);
        const details = auditDetails({
            field: 'Salary',
            visibleToRoleIdsTo: capped(ids, 70),
            visibleToRolesTo: capped(names, 70),
        });

        const [text] = line(details, 'Visible to after')!;
        expect(text).toMatch(/^role0 \(no such role\), role1 \(no such role\)/);
        expect(text).toMatch(/and 20 more$/);
        expect(line(details, 'Field')).toEqual(['Salary']);
    });

    it('reads a role change as capabilities added and removed and one line per permission', () => {
        const details = auditDetails({
            name: 'Nurse',
            nameBefore: 'Nurse',
            capabilitiesAdded: capped(['view_sensitive']),
            capabilitiesRemoved: capped([]),
            permissionsAfter: capped([
                {
                    contentType: 'patient',
                    actions: ['read', 'update'],
                    transitions: capped([]),
                    conditions: capped([{ rule: 'read', field: 'Ward.Nurse', operators: ['_eq'] }]),
                    fieldSets: capped([{ rule: 'update', access: 'writable', fields: capped(['Notes']) }]),
                },
            ]),
            conditionsChanged: true,
        });

        expect(line(details, 'Capabilities added')).toEqual(['view_sensitive']);
        expect(line(details, 'Capabilities removed')).toEqual(['none']);
        expect(line(details, 'Permissions after')).toEqual([
            'patient: read, update; conditions: read when Ward.Nurse _eq; field limits: update writable Notes',
        ]);
        expect(line(details, 'Conditions changed')).toEqual(['yes']);
    });

    it('names the role of a global role assignment', () => {
        expect(line(auditDetails({ roleId: 'r-9', roleName: 'Payroll' }), 'Role')).toEqual(['Payroll (r-9)']);
    });

    it('keeps a key it does not know under its own name', () => {
        expect(auditDetails({ somethingNew: 3 })).toEqual([{ label: 'somethingNew', lines: ['3'] }]);
    });

    it('has nothing to say about an entry with no metadata', () => {
        expect(auditDetails(null)).toEqual([]);
    });
});
