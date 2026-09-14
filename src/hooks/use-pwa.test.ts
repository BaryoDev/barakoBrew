import { describe, expect, it } from 'vitest';
import type { Paginated } from '@/lib/api';
import { installsFromPage, type InstallDto } from './use-pwa';

function device(overrides: Partial<InstallDto> = {}): InstallDto {
    return {
        userId: null,
        username: null,
        tenant: 'default',
        platform: 'macos',
        displayMode: 'browser',
        installed: false,
        userAgent: null,
        launchCount: 1,
        firstSeenAt: '2026-09-01T00:00:00Z',
        lastSeenAt: '2026-09-14T00:00:00Z',
        installedAt: null,
        ...overrides,
    };
}

function page(items: InstallDto[], totalItems: number): Paginated<InstallDto> {
    return {
        items,
        totalItems,
        page: 1,
        pageSize: 100,
        totalPages: Math.max(1, Math.ceil(totalItems / 100)),
        hasNextPage: totalItems > items.length,
        hasPreviousPage: false,
    };
}

describe('installsFromPage', () => {
    it('reads the devices out of the paged response instead of treating the response as the list', () => {
        // The API has returned the envelope since 4.0.0. Reading it as an array is what made the
        // screen call filter on an object and crash.
        const installed = device({ username: 'admin', installed: true });
        const anonymous = device();

        const result = installsFromPage(page([installed, anonymous], 2));

        expect(result.devices).toHaveLength(2);
        expect(result.devices).toEqual([installed, anonymous]);
        expect(result.devices.filter((d) => d.installed)).toEqual([installed]);
    });

    it('counts every device the API knows about, not only the ones on the page', () => {
        const result = installsFromPage(page([device(), device()], 250));

        expect(result.devices).toHaveLength(2);
        expect(result.totalDevices).toBe(250);
    });

    it('gives an empty list when a host returns no items', () => {
        const result = installsFromPage({ ...page([], 0), items: undefined as unknown as InstallDto[] });

        expect(result.devices).toEqual([]);
        expect(result.totalDevices).toBe(0);
    });
});
