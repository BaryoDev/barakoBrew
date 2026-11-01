import { describe, it, expect } from 'vitest';
import { saveLabel } from '@/components/tenants/tenant-rail';
import { tenantDomainsBody, tenantUpdateBody, type Tenant } from '@/types/tenant';

describe('the tenant save button label', () => {
    it('names the consequence of each status change', () => {
        expect(saveLabel('Active', 'Active')).toBe('Save changes');
        expect(saveLabel('Active', 'Suspended')).toBe('Save and suspend');
        expect(saveLabel('Active', 'Archived')).toBe('Save and archive');
        expect(saveLabel('Suspended', 'Active')).toBe('Save and reactivate');
        expect(saveLabel('Archived', 'Archived')).toBe('Save changes');
    });
});

describe('the tenant update body', () => {
    const padded: Tenant = { id: 't-1', slug: 'north', name: ' North ', isActive: true, status: 'Active', domains: [] };

    it('sends the name as read when only the domains change', () => {
        expect(tenantDomainsBody(padded, ['a.example']).Name).toBe(' North ');
    });

    it('trims a name the user typed', () => {
        expect(tenantUpdateBody(padded, { name: '  South ' }).Name).toBe('South');
    });
});
