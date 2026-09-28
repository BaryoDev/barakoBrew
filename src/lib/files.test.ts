import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, canDeleteFile, contentProblem, formatBytes, publicFileLink, uploadProblem } from './files';
import { SAMPLES, sample } from '@/test/file-samples';

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

    it('matches the bare type exactly, ignoring case and parameters, the way the server does', () => {
        expect(uploadProblem({ size: 100, type: 'IMAGE/PNG' })).toBeNull();
        expect(uploadProblem({ size: 100, type: 'application/pdf; charset=binary' })).toBeNull();
    });

    // The server used to match by prefix, so these passed there. It now parses the type and compares
    // it whole, and so does this.
    it('refuses a type that only starts with an allowed one', () => {
        for (const type of ['image/pngx', 'image/png+xml', 'application/pdfx', 'image/jpeg2000']) {
            expect(uploadProblem({ size: 100, type }), type).toMatch(/Only PNG, JPEG/);
        }
    });

    it('refuses an empty file', () => {
        expect(uploadProblem({ size: 0, type: 'image/png' })).toBe('This file is empty.');
    });
});

describe('contentProblem', () => {
    it('accepts a file of every allowed type that starts the way its format does', async () => {
        expect(SAMPLES).toHaveLength(6);
        for (const [type, bytes] of SAMPLES) {
            expect(await contentProblem(sample('f', type, bytes)), type).toBeNull();
        }
    });

    it('accepts a declared type with parameters by its bare type', async () => {
        expect(await contentProblem(sample('f.pdf', 'application/pdf; charset=binary', SAMPLES[5][1]))).toBeNull();
    });

    it('refuses a file whose bytes are not the declared format, and names that format', async () => {
        const html = new TextEncoder().encode('<html><script>1</script></html>');
        expect(await contentProblem(sample('x.png', 'image/png', html))).toBe("This file's contents are not a PNG image.");
        expect(await contentProblem(sample('x.pdf', 'application/pdf', html))).toBe("This file's contents are not a PDF.");
        expect(await contentProblem(sample('x.avif', 'image/avif', html))).toBe("This file's contents are not an AVIF image.");
    });

    it('refuses a real file of one allowed type declared as another', async () => {
        const [, png] = SAMPLES[0];
        expect(await contentProblem(sample('x.jpg', 'image/jpeg', png))).toBe("This file's contents are not a JPEG image.");
    });

    it('refuses a RIFF file that is not WebP, and an ftyp box with no AVIF brand', async () => {
        const wav = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WAVEfmt ')]);
        expect(await contentProblem(sample('x.webp', 'image/webp', wav))).toMatch(/not a WebP image/);
        const mp4 = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode('ftypisom'), 0, 0, 0, 0, ...new TextEncoder().encode('isommp41')]);
        expect(await contentProblem(sample('x.avif', 'image/avif', mp4))).toMatch(/not an AVIF image/);
    });

    it('leaves a type it does not know to uploadProblem', async () => {
        expect(await contentProblem(sample('x.svg', 'image/svg+xml', new TextEncoder().encode('<svg/>')))).toBeNull();
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
