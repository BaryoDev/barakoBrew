import { describe, it, expect } from 'vitest';
import { SensitivityLevel, type FieldDefinition } from './definition';
import { fieldIsVisibleTo, maskedNotice, SUPER_ADMIN_ROLE_ID } from './sensitivity';

function field(sensitivity: SensitivityLevel, visibleToRoles?: string[]): FieldDefinition {
    return { name: 'Salary', displayName: 'Salary', type: 'string', isRequired: false, sensitivity, visibleToRoles };
}

const sensitive = field(SensitivityLevel.Sensitive);
const hidden = field(SensitivityLevel.Hidden);

describe('field sensitivity decided by capability, as API 4.6 decides it', () => {
    it('opens an unlisted Sensitive field to a custom role holding view_sensitive', () => {
        // The case the name rule got wrong: a Nurse role granted view_sensitive was shown the masked notice.
        expect(fieldIsVisibleTo(sensitive, ['Nurse'])).toBe(false);
        expect(fieldIsVisibleTo(sensitive, { roles: ['Nurse'], capabilities: ['view_sensitive'] })).toBe(true);
    });

    it('keeps an unlisted Sensitive field closed to a role named HR that holds no capability', () => {
        expect(fieldIsVisibleTo(sensitive, ['HR'])).toBe(true);
        expect(fieldIsVisibleTo(sensitive, { roles: ['HR'], capabilities: [] })).toBe(false);
    });

    it('opens an unlisted Hidden field to view_hidden and not to view_sensitive', () => {
        expect(fieldIsVisibleTo(hidden, { roles: ['Auditor'], capabilities: ['view_hidden'] })).toBe(true);
        expect(fieldIsVisibleTo(hidden, { roles: ['Nurse'], capabilities: ['view_sensitive'] })).toBe(false);
    });

    it('lets the wildcard satisfy both capabilities', () => {
        expect(fieldIsVisibleTo(sensitive, { roles: ['Ops'], capabilities: ['*'] })).toBe(true);
        expect(fieldIsVisibleTo(hidden, { roles: ['Ops'], capabilities: ['*'] })).toBe(true);
    });

    it('reads a field role list as replacing the capability default', () => {
        const listed = field(SensitivityLevel.Sensitive, ['Payroll']);
        expect(fieldIsVisibleTo(listed, { roles: ['Payroll'], capabilities: [] })).toBe(true);
        expect(fieldIsVisibleTo(listed, { roles: ['Nurse'], capabilities: ['view_sensitive'] })).toBe(false);
    });

    it('recognises SuperAdmin by the seeded id, not by the name', () => {
        expect(fieldIsVisibleTo(hidden, { roles: ['Owner'], roleIds: [SUPER_ADMIN_ROLE_ID], capabilities: [] })).toBe(
            true,
        );
        expect(fieldIsVisibleTo(hidden, { roles: ['SuperAdmin'], roleIds: ['r-renamed'], capabilities: [] })).toBe(
            false,
        );
    });
});

describe('field sensitivity against an API that reports no capabilities', () => {
    it('falls back to role names: SuperAdmin everything, HR an unlisted Sensitive field', () => {
        expect(fieldIsVisibleTo(hidden, { roles: ['SuperAdmin'] })).toBe(true);
        expect(fieldIsVisibleTo(sensitive, { roles: ['HR'] })).toBe(true);
        expect(fieldIsVisibleTo(hidden, { roles: ['HR'] })).toBe(false);
        expect(fieldIsVisibleTo(sensitive, { roles: ['Editor'] })).toBe(false);
    });

    it('leaves a Public field open to anybody', () => {
        expect(fieldIsVisibleTo(field(SensitivityLevel.Public), [])).toBe(true);
    });
});

describe('the masked notice', () => {
    it('names the level and does not blame the viewer roles, since a capability may decide', () => {
        expect(maskedNotice(hidden)).toMatch(/^Hidden\. You cannot read this field/);
        expect(maskedNotice(sensitive)).not.toMatch(/your roles/i);
    });
});
