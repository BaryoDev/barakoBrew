import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { ResponseShapeError, isResponseShapeError, paginatedSchema, parseResponse } from './api';

const ENVELOPE = { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
const item = z.looseObject({ id: z.string() });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('parseResponse', () => {
    it('hands back the envelope it was given, members the schema does not name included', () => {
        const body = { ...ENVELOPE, items: [{ id: 'a', extra: 1 }, { id: 'b' }] };

        const parsed = parseResponse(paginatedSchema(item), body, 'GET /things');

        expect(parsed.items).toHaveLength(2);
        expect(parsed.items[0]).toEqual({ id: 'a', extra: 1 });
    });

    it('throws a ResponseShapeError naming the endpoint and the path, for items under another name', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const body = { ...ENVELOPE, versions: [{ id: 'a' }] };

        let thrown: unknown;
        try {
            parseResponse(paginatedSchema(item), body, 'GET /things');
        } catch (error) {
            thrown = error;
        }

        expect(isResponseShapeError(thrown)).toBe(true);
        const error = thrown as ResponseShapeError;
        expect(error.endpoint).toBe('GET /things');
        expect(error.issues.map((i) => i.path)).toEqual(['items']);
    });

    it('never puts a value from the body in its message', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const secret = 'tok_live_do_not_log';

        expect(() => parseResponse(z.object({ id: z.number() }), { id: secret }, 'GET /x')).toThrow(ResponseShapeError);
        try {
            parseResponse(z.object({ id: z.number() }), { id: secret }, 'GET /x');
        } catch (error) {
            expect((error as Error).message).toContain('id');
            expect((error as Error).message).not.toContain(secret);
        }
        expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain(secret);
    });
});
