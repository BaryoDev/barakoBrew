import { describe, expect, it } from 'vitest';
import { buildPairingLink, countdownLabel, isSecureForPhone, unixSeconds } from './pairing-link';

const base = {
    url: 'https://cms.example.com/api-base',
    tenant: 'acme',
    name: 'Acme',
    code: 'ABCDEFGH2345',
    expiresAt: '2026-11-18T10:05:00Z',
};

describe('the pairing link', () => {
    it('uses the contract scheme and order', () => {
        const link = buildPairingLink(base)!;
        expect(link.startsWith('togo://connect?v=2&url=')).toBe(true);
        expect(link.split('?')[1].split('&').map((p) => p.split('=')[0])).toEqual([
            'v', 'url', 'tenant', 'name', 'code', 'exp',
        ]);
    });

    it('encodes every value', () => {
        const link = buildPairingLink({
            url: 'https://h.example.com:8443/a b',
            tenant: 't&x=1',
            name: 'Café & Co #1',
            code: 'a/b+c=',
            expiresAt: base.expiresAt,
        })!;
        const q = new URLSearchParams(link.split('?')[1]);
        expect(link).toContain(`url=${encodeURIComponent('https://h.example.com:8443/a b')}`);
        expect(link).toContain(`tenant=${encodeURIComponent('t&x=1')}`);
        expect(link).toContain(`name=${encodeURIComponent('Café & Co #1')}`);
        expect(link).toContain(`code=${encodeURIComponent('a/b+c=')}`);
        expect([...q.keys()]).toHaveLength(6);
        expect(q.get('tenant')).toBe('t&x=1');
        expect(q.get('name')).toBe('Café & Co #1');
        expect(q.get('code')).toBe('a/b+c=');
    });

    it('carries the expiry in unix seconds, not milliseconds', () => {
        const link = buildPairingLink(base)!;
        expect(new URLSearchParams(link.split('?')[1]).get('exp')).toBe('1794996300');
        expect(unixSeconds('2026-11-18T10:05:00.999Z')).toBe(1794996300);
    });

    it('drops a trailing slash from the url', () => {
        const link = buildPairingLink({ ...base, url: 'https://cms.example.com/' })!;
        expect(new URLSearchParams(link.split('?')[1]).get('url')).toBe('https://cms.example.com');
    });

    it('gives no link when the expiry does not parse', () => {
        expect(buildPairingLink({ ...base, expiresAt: 'soon' })).toBeNull();
    });
});

describe('the countdown label', () => {
    it('reads minutes and seconds', () => {
        expect(countdownLabel(5 * 60_000)).toBe('5:00');
        expect(countdownLabel(247_000)).toBe('4:07');
        expect(countdownLabel(500)).toBe('0:01');
    });

    it('stops at zero', () => {
        expect(countdownLabel(0)).toBe('0:00');
        expect(countdownLabel(-9000)).toBe('0:00');
    });
});

describe('which addresses a phone may use', () => {
    it('allows https', () => {
        expect(isSecureForPhone('https://cms.example.com')).toBe(true);
    });

    it('allows http only for the local hosts', () => {
        expect(isSecureForPhone('http://localhost:5005')).toBe(true);
        expect(isSecureForPhone('http://127.0.0.1:5005')).toBe(true);
        expect(isSecureForPhone('http://10.0.2.2:5005')).toBe(true);
        expect(isSecureForPhone('http://cms.example.com')).toBe(false);
        expect(isSecureForPhone('http://192.168.1.5:5005')).toBe(false);
        expect(isSecureForPhone('http://localhost.evil.com')).toBe(false);
    });

    it('refuses anything that is not an address', () => {
        expect(isSecureForPhone('not a url')).toBe(false);
        expect(isSecureForPhone('ftp://localhost')).toBe(false);
    });
});
