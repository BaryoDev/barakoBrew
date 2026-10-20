import { describe, expect, it } from 'vitest';
import { isAsNew, mergeRunPage, type MergeablePage, type MergeableRun } from './run-merge';

function run(id: string, created: string, extra: Partial<MergeableRun> = {}): MergeableRun {
    return { id, status: 'Succeeded', createdAt: `2026-10-19T${created}:00Z`, updatedAt: `2026-10-19T${created}:30Z`, ...extra };
}

function page(items: MergeableRun[], extra: Partial<MergeablePage<MergeableRun>> = {}): MergeablePage<MergeableRun> {
    return { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ...extra };
}

const none: MergeableRun[] = [];
const ids = (p: { items: MergeableRun[] }) => p.items.map((r) => r.id);

describe('merging a poll into a page', () => {
    it('replaces a run by id and keeps one row for a run the API returned twice', () => {
        const current = page([run('a', '10:00'), run('b', '09:00')]);
        const changed = run('b', '09:00', { status: 'Failed', updatedAt: '2026-10-19T10:30:00Z' });

        const once = mergeRunPage(current, [changed]).page;
        const twice = mergeRunPage(once, [changed]).page;

        expect(twice.items).toHaveLength(2);
        expect(ids(twice)).toEqual(['a', 'b']);
        expect(twice.items[1].status).toBe('Failed');
    });

    it('keeps the order by createdAt, whatever order the poll came in', () => {
        const current = page([run('a', '10:00'), run('c', '08:00')]);
        const merged = mergeRunPage(current, [run('d', '11:00'), run('b', '09:00')]).page;

        expect(ids(merged)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('does not put an older copy over a newer one', () => {
        const current = page([run('a', '10:00', { status: 'Failed', updatedAt: '2026-10-19T12:00:00Z' })]);
        const merged = mergeRunPage(current, [run('a', '10:00', { status: 'Running', updatedAt: '2026-10-19T11:00:00Z' })]).page;

        expect(merged.items[0].status).toBe('Failed');
    });

    it('removes a run that no longer has the filtered status, and counts it as removed', () => {
        const current = page([run('a', '10:00', { status: 'Failed' }), run('b', '09:00', { status: 'Failed' })]);
        const result = mergeRunPage(current, [run('a', '10:00', { status: 'Succeeded', updatedAt: '2026-10-19T12:00:00Z' })], {
            status: 'Failed',
        });

        expect(ids(result.page)).toEqual(['b']);
        expect(result.removed).toBe(1);
        expect(result.page.totalItems).toBe(1);
    });

    it('adds a new run on page 1 but not on page 2', () => {
        const fresh = run('new', '12:00');

        expect(ids(mergeRunPage(page([run('a', '10:00')]), [fresh]).page)).toEqual(['new', 'a']);
        expect(ids(mergeRunPage(page([run('a', '10:00')], { page: 2 }), [fresh]).page)).toEqual(['a']);
    });

    it('ignores an old run that changed when it sorts after the last row of a full page', () => {
        const full = page([run('a', '10:00'), run('b', '09:00')], { pageSize: 2, totalItems: 5, totalPages: 3, hasNextPage: true });
        const merged = mergeRunPage(full, [run('old', '01:00')]).page;

        expect(ids(merged)).toEqual(['a', 'b']);
        expect(merged.totalItems).toBe(5);
    });

    it('trims a full page back to its size when a new run pushes one off', () => {
        const full = page([run('a', '10:00'), run('b', '09:00')], { pageSize: 2, totalItems: 2 });
        const merged = mergeRunPage(full, [run('new', '12:00')]).page;

        expect(ids(merged)).toEqual(['new', 'a']);
        expect(merged.totalItems).toBe(3);
        expect(merged.totalPages).toBe(2);
        expect(merged.hasNextPage).toBe(true);
    });

    it('takes the totals from counts handed in, under a filter and without', () => {
        const current = page([run('a', '10:00', { status: 'Failed' })]);
        const counts = { Failed: 7, Succeeded: 3 };

        expect(mergeRunPage(current, none, { statusCounts: counts }).page.totalItems).toBe(10);
        expect(mergeRunPage(current, none, { statusCounts: counts, status: 'Failed' }).page.totalItems).toBe(7);
    });

    describe('with held counts and a poll that carries none', () => {
        const held = () =>
            page([run('a', '10:00', { status: 'Failed' }), run('b', '09:00')], {
                statusCounts: { Failed: 1, Succeeded: 5 },
                totalItems: 6,
            });
        const changedA = run('a', '10:00', { status: 'Succeeded', updatedAt: '2026-10-19T11:00:00Z' });

        it('moves a count from the old status of a run to its new one', () => {
            const merged = mergeRunPage(held(), [changedA]).page;

            expect(merged.items).toHaveLength(2);
            expect(merged.statusCounts).toEqual({ Failed: 0, Succeeded: 6 });
            expect(merged.totalItems).toBe(6);
        });

        it('counts a run new to the list under its status and raises the total', () => {
            const merged = mergeRunPage(held(), [run('c', '12:00', { status: 'Pending' })]).page;

            expect(ids(merged)).toEqual(['c', 'a', 'b']);
            expect(merged.statusCounts).toEqual({ Failed: 1, Succeeded: 5, Pending: 1 });
            expect(merged.totalItems).toBe(7);
        });

        it('takes the total of a filtered view from the adjusted count, not from the stale one', () => {
            const filtered = page([run('a', '10:00', { status: 'Failed' })], {
                statusCounts: { Failed: 1, Succeeded: 5 },
                totalItems: 1,
            });
            const merged = mergeRunPage(filtered, [changedA], { status: 'Failed' }).page;

            expect(merged.items).toHaveLength(0);
            expect(merged.totalItems).toBe(0);
            expect(merged.statusCounts).toEqual({ Failed: 0, Succeeded: 6 });
        });

        it('moves a count for a run that is off the page but was seen before', () => {
            const seen = new Map([['z', run('z', '01:00', { status: 'Running', updatedAt: '2026-10-19T01:30:00Z' })]]);
            const current = page([run('a', '10:00')], { statusCounts: { Running: 1, Succeeded: 4 }, totalItems: 5 });
            const merged = mergeRunPage(current, [run('z', '01:00', { status: 'Failed', updatedAt: '2026-10-19T02:00:00Z' })], {
                known: seen,
            }).page;

            expect(merged.statusCounts).toEqual({ Running: 0, Succeeded: 4, Failed: 1 });
            expect(merged.totalItems).toBe(5);
        });

        it('changes nothing when the same run comes back again', () => {
            const once = mergeRunPage(held(), [changedA]).page;
            const twice = mergeRunPage(once, [changedA]).page;

            expect(twice.statusCounts).toEqual({ Failed: 0, Succeeded: 6 });
            expect(twice.totalItems).toBe(6);
        });

        it('keeps the local delta for the total when no counts are held', () => {
            const bare = page([run('a', '10:00')], { totalItems: 4 });

            expect(mergeRunPage(bare, [run('c', '12:00')]).page.totalItems).toBe(5);
        });
    });

    it('treats a missing updatedAt on the held copy as older', () => {
        expect(isAsNew(run('a', '10:00'), { id: 'a', status: 'Failed', createdAt: '2026-10-19T10:00:00Z' })).toBe(true);
    });
});
