import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { AxiosError } from 'axios';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const hooks = vi.hoisted(() => ({
    flags: { data: undefined as unknown, isLoading: false, isError: false, error: undefined as unknown },
    errors: { data: undefined as unknown, isLoading: false, isError: false },
    accounts: { data: undefined as unknown, isLoading: false, isError: false },
    files: { data: undefined as unknown, isLoading: false, isError: false },
    forms: { data: undefined as unknown, isLoading: false, isError: false },
}));
vi.mock('@/hooks/use-forms', () => ({
    useForms: () => hooks.forms,
    useSetForm: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-files', () => ({
    useFiles: () => hooks.files,
    useDeleteFile: () => ({ mutateAsync: vi.fn() }),
    deleteRefusal: () => null,
    FILES_PAGE_SIZE: 20,
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

const access = vi.hoisted(() => ({ held: new Set<string>(['upload_files', 'manage_feature_flags', 'manage_forms']) }));
vi.mock('@/hooks/use-access', () => ({
    useAccess: () => ({ can: (c: string) => access.held.has(c) }),
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

describe('list failures', () => {
    const failWith = (error: unknown) => {
        hooks.flags.data = undefined;
        hooks.flags.isError = true;
        hooks.flags.error = error;
    };
    const reset = () => {
        hooks.flags.isError = false;
        hooks.flags.error = undefined;
    };

    it('says the user lacks permission on a 403, not the generic failure', () => {
        failWith(refusal(403, {}));
        render(<ModuleAdapterBody name="FeatureFlags" side={null} />);
        expect(screen.getByText(/You do not have permission to view this module/)).toBeTruthy();
        expect(screen.queryByText('Could not load this list.')).toBeNull();
        reset();
    });

    it('keeps the generic failure on a 500', () => {
        failWith(refusal(500, {}));
        render(<ModuleAdapterBody name="FeatureFlags" side={null} />);
        expect(screen.getByText('Could not load this list.')).toBeTruthy();
        expect(screen.queryByText(/You do not have permission/)).toBeNull();
        reset();
    });

    it('keeps the generic failure on an error with no status', () => {
        failWith(new Error('network'));
        render(<ModuleAdapterBody name="FeatureFlags" side={null} />);
        expect(screen.getByText('Could not load this list.')).toBeTruthy();
        reset();
    });
});

describe('primary action', () => {
    it('shows Upload on Files and sends the user to the Files page', () => {
        hooks.files.data = { items: [], totalItems: 0 };
        render(<ModuleAdapterBody name="Files" side={null} />);
        const upload = screen.getByRole('link', { name: 'Upload' });
        expect(upload.getAttribute('href')).toBe('/files');
    });

    it('shows Manage flags on Feature flags and links to the flags page', () => {
        hooks.flags.data = [];
        render(<ModuleAdapterBody name="FeatureFlags" side={null} />);
        expect(screen.getByRole('link', { name: 'Manage flags' }).getAttribute('href')).toBe('/feature-flags');
    });

    it('shows Manage forms on Forms and links to the forms settings page', () => {
        hooks.forms.data = { kind: 'forms', forms: [] };
        render(<ModuleAdapterBody name="Forms" side={null} />);
        expect(screen.getByRole('link', { name: 'Manage forms' }).getAttribute('href')).toBe('/settings/forms');
    });

    it('hides a primary from a user without its capability', () => {
        hooks.flags.data = [];
        hooks.forms.data = { kind: 'forms', forms: [] };
        hooks.files.data = { items: [], totalItems: 0 };
        access.held.clear();
        try {
            for (const name of ['FeatureFlags', 'Forms', 'Files']) {
                const { unmount } = render(<ModuleAdapterBody name={name} side={null} />);
                expect(screen.queryByRole('link')).toBeNull();
                unmount();
            }
        } finally {
            ['upload_files', 'manage_feature_flags', 'manage_forms'].forEach((c) => access.held.add(c));
        }
    });
});
