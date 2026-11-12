import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import {
    domainClash,
    domainProblems,
    MAX_TENANT_DOMAINS,
    switchTenantBody,
    tenantStatusLabel,
    tenantWriteBody,
    type Tenant,
} from './use-tenants';

const TENANT: Tenant = {
    id: 't1',
    slug: 'rckoronadal',
    name: 'Rotary Club of Koronadal',
    domains: ['rckoronadal.org'],
    isActive: true,
};

describe('tenantWriteBody', () => {
    it('sends only the fields the API accepts, with the domains trimmed', () => {
        const body = tenantWriteBody({
            name: ' Rotary Club of Koronadal ',
            status: 'Active',
            signUp: 'InviteOnly',
            domains: ['rckoronadal.org', ' www.rckoronadal.org '],
        });

        expect(body).toEqual({
            Name: 'Rotary Club of Koronadal',
            Status: 'Active',
            SignUp: 'InviteOnly',
            Domains: ['rckoronadal.org', 'www.rckoronadal.org'],
        });
    });

    it('sends the status, never the obsolete flag', () => {
        const body = tenantWriteBody({ name: TENANT.name, status: 'Archived', domains: [] });

        expect(body.Status).toBe('Archived');
        expect(body).not.toHaveProperty('IsActive');
    });

    it('sends a role id only with an Open sign-up, which is the only policy the API accepts one with', () => {
        const closed = tenantWriteBody({ name: 'A', status: 'Active', signUp: 'Closed', signUpRoleId: 'r-1', domains: [] });
        const open = tenantWriteBody({ name: 'A', status: 'Active', signUp: 'Open', signUpRoleId: 'r-1', domains: [] });

        expect(closed).not.toHaveProperty('SignUpRoleId');
        expect(open.SignUpRoleId).toBe('r-1');
    });

    it('sends the flag, not a status, to an API before contract 8, which reports none', () => {
        const body = tenantWriteBody({ name: TENANT.name, status: 'Suspended', domains: ['rckoronadal.org'], legacyFlag: true });

        expect(body.IsActive).toBe(false);
        expect(body).not.toHaveProperty('Status');
        expect(tenantWriteBody({ name: 'A', status: 'Active', domains: [], legacyFlag: true }).IsActive).toBe(true);
    });

    it('sends an empty list to clear the domains, not null, which the API reads as keep', () => {
        expect(tenantWriteBody({ name: 'A', status: 'Active', domains: [] }).Domains).toEqual([]);
    });

    it('names the handle only on a create', () => {
        expect(tenantWriteBody({ handle: 'south', name: 'A', status: 'Active', domains: [] }).Handle).toBe('south');
        expect(tenantWriteBody({ name: 'A', status: 'Active', domains: [] })).not.toHaveProperty('Handle');
    });
});

describe('switchTenantBody', () => {
    it('names the tenant as tenant for API 4.6 and as club for an older API', () => {
        expect(switchTenantBody('north')).toEqual({ Tenant: 'north', Club: 'north' });
    });
});

describe('domainProblems', () => {
    it('accepts bare hosts', () => {
        expect(domainProblems(['rckoronadal.org', 'www.baryo.dev', 'Barakocms.com'])).toEqual([]);
    });

    it('names each value the API would refuse, and why', () => {
        const problems = domainProblems(['https://baryo.dev', 'baryo.dev:8080', '*.baryo.dev', 'localhost', '10.0.0.1', '']);

        expect(problems).toHaveLength(6);
        expect(problems[0]).toContain('not a bare host');
        expect(problems[1]).toContain('not a bare host');
        expect(problems[2]).toContain('not a bare host');
        expect(problems[3]).toContain('not a valid domain name');
        expect(problems[4]).toContain('not a valid domain name');
        expect(problems[5]).toBe('A domain cannot be empty.');
    });

    it('refuses a host of digit labels, which the API reads as a short IPv4 address', () => {
        expect(domainProblems(['1.2', '127.1', 'www.1.2'])).toEqual([
            "'1.2' is not a valid domain name.",
            "'127.1' is not a valid domain name.",
            "'www.1.2' is not a valid domain name.",
        ]);
        expect(domainProblems(['0x7f.1'])).toEqual(["'0x7f.1' is not a valid domain name."]);
        // Not addresses to the API either, so it takes them as names.
        expect(domainProblems(['1password.com', '123.example', '999.1', '1.2.3.4.5', '08.1'])).toEqual([]);
    });

    it('counts www. and the bare host as one domain toward the limit, as the API stores them', () => {
        const many = Array.from({ length: MAX_TENANT_DOMAINS }, (_, i) => `site${i}.example.com`);
        expect(many).toHaveLength(20);
        expect(domainProblems([...many, 'www.site0.example.com'])).toEqual([]);
        expect(domainProblems([...many, 'www.site20.example.com'])).toEqual(['A tenant can have at most 20 domains.']);
    });

    it('refuses more than twenty distinct domains', () => {
        const many = Array.from({ length: 21 }, (_, i) => `site${i}.example.com`);
        expect(domainProblems(many)).toEqual(['A tenant can have at most 20 domains.']);
        expect(domainProblems(many.slice(0, 20))).toEqual([]);
    });
});

function httpError(status: number, data: unknown) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

describe('domainClash', () => {
    it('reads the sentence the 409 carries, naming the tenant holding the domain', () => {
        const message = "'baryo.dev' is already a domain of tenant 'baryo'. A domain belongs to one tenant.";
        expect(domainClash(httpError(409, { statusCode: 409, message, errors: {} }))).toBe(message);
        expect(domainClash(httpError(409, { errors: [{ name: 'generalErrors', reason: message }] }))).toBe(message);
    });

    it('is null for any other failure', () => {
        expect(domainClash(httpError(400, { message: 'bad' }))).toBeNull();
        expect(domainClash(new Error('network'))).toBeNull();
    });
});

describe('tenantStatusLabel', () => {
    it('names the status a contract 8 API reports, so Suspended and Archived read apart', () => {
        expect(tenantStatusLabel({ isActive: false, status: 'Suspended' })).toBe('Suspended');
        expect(tenantStatusLabel({ isActive: false, status: 'Archived' })).toBe('Archived');
        expect(tenantStatusLabel({ isActive: true, status: 'Active' })).toBe('Active');
    });

    it('falls back to the flag against an API before contract 8', () => {
        expect(tenantStatusLabel({ isActive: true })).toBe('Active');
        expect(tenantStatusLabel({ isActive: false })).toBe('Inactive');
    });
});
