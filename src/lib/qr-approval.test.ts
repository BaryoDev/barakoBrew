import { describe, it, expect } from 'vitest';
import { readQrCreate, readQrPoll } from './qr-approval';

const create = { qrPayload: 'req:abc', matchNumber: '482913', secret: 'browser-secret', expiresInSeconds: 120 };

describe('the QR approval readers', () => {
    it('read a well formed create reply', () => {
        expect(readQrCreate(create)).toMatchObject({ qrPayload: 'req:abc', matchNumber: '482913', secret: 'browser-secret' });
    });

    it('refuse a malformed create reply', () => {
        for (const bad of [
            null,
            'text',
            [],
            {},
            { ...create, qrPayload: '' },
            { ...create, matchNumber: '<b>1</b>' },
            { ...create, secret: undefined },
            { ...create, expiresInSeconds: -1 },
            { ...create, expiresInSeconds: 'soon' },
            { ...create, qrPayload: 'https://x.test/?s=browser-secret' },
        ]) {
            expect(readQrCreate(bad)).toBeNull();
        }
    });

    it('cap the lifetime of a request', () => {
        expect(readQrCreate({ ...create, expiresInSeconds: 10_000_000 })?.expiresInSeconds).toBe(3600);
    });

    it('read poll statuses and refuse an approval with no token', () => {
        expect(readQrPoll({ status: 'scanned' })?.status).toBe('scanned');
        expect(readQrPoll({ status: 'approved', token: 't' })?.tokens).toEqual({ token: 't' });
        expect(readQrPoll({ status: 'approved' })).toBeNull();
        expect(readQrPoll({ status: 'approved', token: '' })).toBeNull();
        expect(readQrPoll({ status: 'maybe' })).toBeNull();
        expect(readQrPoll('approved')).toBeNull();
    });
});
