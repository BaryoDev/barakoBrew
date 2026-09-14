import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { domainClash, domainProblems, tenantDomainsBody, type Tenant } from './use-tenants';

const TENANT: Tenant = {
    id: 't1',
    slug: 'rckoronadal',
    name: 'Rotary Club of Koronadal',
    about: 'Service above self',
    logoUrl: 'https://rckoronadal.org/logo.png',
    email: 'club@rckoronadal.org',
    location: 'Koronadal',
    locationUrl: 'https://maps.example/koronadal',
    socialHandle: '@rckoronadal',
    contactUrl: 'https://rckoronadal.org/contact',
    domains: ['rckoronadal.org'],
    isActive: true,
};

describe('tenantDomainsBody', () => {
    it('sends the whole profile back with the new domains, so a domain edit wipes nothing', () => {
        const body = tenantDomainsBody(TENANT, ['rckoronadal.org', ' www.rckoronadal.org ']);

        expect(body).toEqual({
            Handle: 'rckoronadal',
            Name: 'Rotary Club of Koronadal',
            LogoUrl: 'https://rckoronadal.org/logo.png',
            About: 'Service above self',
            Location: 'Koronadal',
            LocationUrl: 'https://maps.example/koronadal',
            SocialHandle: '@rckoronadal',
            Email: 'club@rckoronadal.org',
            ContactUrl: 'https://rckoronadal.org/contact',
            IsActive: true,
            Domains: ['rckoronadal.org', 'www.rckoronadal.org'],
        });
    });

    it('sends an empty list to clear the domains, not null, which the API reads as keep', () => {
        expect(tenantDomainsBody(TENANT, []).Domains).toEqual([]);
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
