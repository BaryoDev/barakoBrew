import { describe, expect, it } from 'vitest';
import { countdownLabel, isSecureForPhone } from './pairing-link';

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
