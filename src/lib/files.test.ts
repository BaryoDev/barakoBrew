import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, canDeleteFile, formatBytes, publicFileLink, uploadProblem } from './files';

describe('uploadProblem', () => {
    it('accepts every type the API allows', () => {
        const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf'];
        expect(types.map((type) => uploadProblem({ size: 100, type }))).toEqual(types.map(() => null));
    });

    it('accepts a file of exactly 10 MB and refuses one byte more', () => {
        expect(uploadProblem({ size: MAX_UPLOAD_BYTES, type: 'image/png' })).toBeNull();
        expect(uploadProblem({ size: MAX_UPLOAD_BYTES + 1, type: 'image/png' })).toBe(
            'This file is 10.0 MB. The limit is 10 MB.'
        );
    });

    it('refuses an SVG, which the API leaves out because it can carry script', () => {
        expect(uploadProblem({ size: 100, type: 'image/svg+xml' })).toMatch(/Only PNG, JPEG/);
    });

    it('refuses a file the browser could not name a type for', () => {
        expect(uploadProblem({ size: 100, type: '' })).toMatch(/Only PNG, JPEG/);
    });

    it('matches the type by prefix and ignoring case, the way the server does', () => {
        expect(uploadProblem({ size: 100, type: 'IMAGE/PNG' })).toBeNull();
        expect(uploadProblem({ size: 100, type: 'application/pdf; charset=binary' })).toBeNull();
    });

    it('refuses an empty file', () => {
        expect(uploadProblem({ size: 0, type: 'image/png' })).toBe('This file is empty.');
    });
});

describe('canDeleteFile', () => {
    const mine = { uploadedBy: 'AAAAAAAA-0000-0000-0000-000000000001' };
    const theirs = { uploadedBy: 'bbbbbbbb-0000-0000-0000-000000000002' };

    it('lets an Admin or SuperAdmin delete anyone’s file', () => {
        expect(canDeleteFile({ userId: 'x', roles: ['Admin'] }, theirs)).toBe(true);
        expect(canDeleteFile({ userId: 'x', roles: ['SuperAdmin'] }, theirs)).toBe(true);
    });

    it('lets anyone else delete only what they uploaded, whatever the case of the id', () => {
        const editor = { userId: 'aaaaaaaa-0000-0000-0000-000000000001', roles: ['Editor'] };
        expect(canDeleteFile(editor, mine)).toBe(true);
        expect(canDeleteFile(editor, theirs)).toBe(false);
    });

    it('offers nothing without a session, or to a session without a user id', () => {
        expect(canDeleteFile(null, mine)).toBe(false);
        expect(canDeleteFile({ roles: ['Editor'] }, { uploadedBy: '' })).toBe(false);
    });
});

describe('publicFileLink', () => {
    const base = { id: 'f1', publicUrl: null };

    it('has no link for a private file, since its download needs a token', () => {
        expect(publicFileLink({ ...base, isPublic: false }, 'https://api.example.com')).toBeNull();
    });

    it('uses the API’s anonymous route for a public file with no object store URL', () => {
        expect(publicFileLink({ ...base, isPublic: true }, 'https://api.example.com/')).toBe(
            'https://api.example.com/api/public/files/f1'
        );
    });

    it('uses the object store’s own URL when there is one', () => {
        expect(
            publicFileLink({ ...base, isPublic: true, publicUrl: 'https://cdn.example.com/k.png' }, 'https://api.example.com')
        ).toBe('https://cdn.example.com/k.png');
    });
});

describe('formatBytes', () => {
    it('picks a unit a person reads at a glance', () => {
        expect([formatBytes(512), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(['512 B', '2.0 KB', '3.0 MB']);
    });
});
