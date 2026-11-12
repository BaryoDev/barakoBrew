import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { AxiosError } from 'axios';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const hooks = vi.hoisted(() => ({
    flags: { data: undefined as unknown, isLoading: false, isError: false },
    errors: { data: undefined as unknown, isLoading: false, isError: false },
    accounts: { data: undefined as unknown, isLoading: false, isError: false },
}));
vi.mock('@/hooks/use-feature-flags', () => ({
    useFeatureFlags: () => hooks.flags,
    useToggleFeatureFlag: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-errors', () => ({
    useClientErrors: () => hooks.errors,
    useResolveClientError: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-accounting', () => ({
    useAccounts: () => hooks.accounts,
    accountTypeLabel: (t: string) => t,
}));

const { ModuleAdapterBody, removeFailure } = await import('./module-adapters');

function refusal(status: number, data: unknown) {
    return new AxiosError('x', 'ERR', undefined, undefined, { status, data } as never);
}

describe('removeFailure', () => {
    it('uses the refusal message from a 409', () => {
        expect(axios.isAxiosError(refusal(409, {}))).toBe(true);
        expect(removeFailure(refusal(409, { message: 'File is in use', total: 3, usages: [] }))).toBe('File is in use');
    });

    it('falls back to the usage count when the refusal has no message', () => {
        expect(removeFailure(refusal(409, { total: 1, usages: [] }))).toBe('This file is used by 1 entry.');
    });

    it('returns null for other errors so the generic text is used', () => {
        expect(removeFailure(refusal(500, {}))).toBeNull();
        expect(removeFailure(new Error('boom'))).toBeNull();
    });
});

describe('truncated lists', () => {
    it('says how many Diagnostics rows show of the total', () => {
        const items = Array.from({ length: 25 }, (_, i) => ({
            id: `e${i}`, message: `m${i}`, severity: 'error', count: 1, resolved: false,
            firstSeenAt: '2024-01-01', lastSeenAt: '2024-01-02', source: 's',
        }));
        hooks.errors.data = { items, totalItems: 60, page: 1, pageSize: 25 };
        render(<ModuleAdapterBody name="Diagnostics" side={null} />);
        expect(screen.getByText(/Showing the first 25 of 60/)).toBeTruthy();
    });

    it('has no Diagnostics footer when everything fits', () => {
        hooks.errors.data = { items: [], totalItems: 0, page: 1, pageSize: 25 };
        render(<ModuleAdapterBody name="Diagnostics" side={null} />);
        expect(screen.queryByText(/Showing the first/)).toBeNull();
    });

    it('warns when Accounting returns a full page', () => {
        hooks.accounts.data = Array.from({ length: 100 }, (_, i) => ({
            code: `c${i}`, name: `n${i}`, type: 'Asset', isActive: true, parentCode: null,
        }));
        render(<ModuleAdapterBody name="Accounting" side={null} />);
        expect(screen.getByText(/Showing the first 100 accounts/)).toBeTruthy();
    });
});

describe('call text', () => {
    it('encodes a flag key in the drawer call', async () => {
        hooks.flags.data = [
            { key: 'a/b c', description: '', enabled: false, tenantSlugs: [], userEmails: [], rolloutPercent: 0, updatedAt: '' },
        ];
        render(<ModuleAdapterBody name="FeatureFlags" side={null} />);
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        expect(await screen.findByText('POST /api/feature-flags/admin/a%2Fb%20c/toggle')).toBeTruthy();
    });
});
