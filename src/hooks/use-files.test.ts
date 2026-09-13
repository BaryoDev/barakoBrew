import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { api } from '@/lib/api';
import { deleteRefusal, uploadFile } from './use-files';

/**
 * Through the real client, with only the network swapped out. The client's JSON default is the
 * thing that can break an upload, and mocking `api.post` would hide it.
 */
const originalAdapter = api.defaults.adapter;

afterEach(() => {
    api.defaults.adapter = originalAdapter;
});

function captureRequests() {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
        seen.push(config);
        return {
            data: { id: 'f1', fileName: 'cover.png', contentType: 'image/png', size: 1, isPublic: true, publicUrl: null },
            status: 201,
            statusText: 'Created',
            headers: {},
            config,
        };
    };
    return seen;
}

describe('uploadFile', () => {
    it('sends the file and the public flag as form data, not as JSON', async () => {
        const seen = captureRequests();

        await uploadFile(new File(['png bytes'], 'cover.png', { type: 'image/png' }), true);

        expect(seen).toHaveLength(1);
        const body = seen[0].data;
        // A JSON default on the client turns FormData into a string, and the API then finds no file.
        expect(body).toBeInstanceOf(FormData);
        expect(((body as FormData).get('file') as File).name).toBe('cover.png');
        expect((body as FormData).get('isPublic')).toBe('true');
    });

    it('sends isPublic false when the switch is off, rather than leaving it out', async () => {
        const seen = captureRequests();

        await uploadFile(new File(['pdf'], 'bylaws.pdf', { type: 'application/pdf' }), false);

        expect(seen).toHaveLength(1);
        expect((seen[0].data as FormData).get('isPublic')).toBe('false');
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

describe('deleteRefusal', () => {
    it('reads the entries a 409 names', () => {
        const refusal = deleteRefusal(
            httpError(409, {
                message: 'This file is used by 2 entries.',
                total: 2,
                usages: [{ id: 'c1', contentType: 'article', title: 'Spring roast notes', status: 'Published' }],
            })
        );

        expect(refusal?.total).toBe(2);
        expect(refusal?.usages).toHaveLength(1);
        expect(refusal?.usages[0].title).toBe('Spring roast notes');
    });

    it('is null for any other failure, so a 403 is not shown as a file in use', () => {
        expect(deleteRefusal(httpError(403, {}))).toBeNull();
        expect(deleteRefusal(httpError(409, { message: 'some other conflict' }))).toBeNull();
        expect(deleteRefusal(new Error('network'))).toBeNull();
    });
});
