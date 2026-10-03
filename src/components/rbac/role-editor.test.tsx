import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoleRequest } from '@/types/rbac';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { recordContractVersion, __resetContractForTests } = await import('@/lib/api-contract');
const { RoleEditor } = await import('./role-editor');

const RECORD = {
    name: 'record',
    displayName: 'Record',
    fields: [
        { name: 'Name', displayName: 'Name', type: 'string', isRequired: true },
        { name: 'Attendance', displayName: 'Attendance', type: 'string', isRequired: false },
        { name: 'Grade', displayName: 'Grade', type: 'string', isRequired: false },
    ],
};

async function renderEditor(initial?: RoleRequest) {
    const onSubmit = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <RoleEditor initial={initial} submitLabel="Save role" isPending={false} onSubmit={onSubmit} onCancel={() => {}} />
        </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Record')).toBeInTheDocument());
    return onSubmit;
}

function submitted(onSubmit: ReturnType<typeof vi.fn>): RoleRequest {
    expect(onSubmit).toHaveBeenCalledTimes(1);
    return onSubmit.mock.calls[0][0] as RoleRequest;
}

const ROLE: RoleRequest = {
    name: 'Teacher',
    permissions: [
        {
            contentTypeSlug: 'record',
            create: { enabled: false },
            read: { enabled: true, readableFields: ['Name', 'Attendance'], conditions: { Seats: { _eq: 4 } } },
            update: { enabled: true, writableFields: ['Attendance'] },
            delete: { enabled: false },
            transitions: { approve: { enabled: true } },
        },
    ],
    systemCapabilities: [],
};

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [RECORD], page: 1, pageSize: 20, totalItems: 1 } });
    __resetContractForTests();
    recordContractVersion('6');
});

afterEach(() => {
    __resetContractForTests();
});

describe('capabilities in the role editor', () => {
    it('grants view_sensitive, view_hidden and manage_all_files by their labels', async () => {
        const onSubmit = await renderEditor();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nurse' } });

        fireEvent.click(screen.getByRole('checkbox', { name: 'Read Sensitive fields' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Read Hidden fields' }));
        fireEvent.click(screen.getByRole('checkbox', { name: "Open every user's files" }));
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        expect(submitted(onSubmit).systemCapabilities).toEqual(['view_sensitive', 'view_hidden', 'manage_all_files']);
    });

    it('says view_hidden is platform only and view_sensitive is not', async () => {
        await renderEditor();
        const hidden = screen.getByRole('checkbox', { name: 'Read Hidden fields' });
        const sensitive = screen.getByRole('checkbox', { name: 'Read Sensitive fields' });

        expect(hidden).toHaveAccessibleDescription(/Only a SuperAdmin can give a role holding this to a user/);
        expect(sensitive).not.toHaveAccessibleDescription(/SuperAdmin/);
    });

    it('ticks a stored capability whatever its case, and keeps an unlisted one as a tag', async () => {
        await renderEditor({ ...ROLE, systemCapabilities: ['VIEW_SENSITIVE', 'upload_files'] });
        expect(screen.getByRole('checkbox', { name: 'Read Sensitive fields' })).toBeChecked();
        expect(screen.getByText('upload_files')).toBeInTheDocument();
    });
});

describe('saving a role keeps what the grid does not show', () => {
    it('sends back the stored field sets, a condition it cannot draw, and the transition rules', async () => {
        const onSubmit = await renderEditor(ROLE);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Allow delete on Record' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const [permission] = submitted(onSubmit).permissions;
        expect(permission.delete.enabled).toBe(true);
        expect(permission.read.readableFields).toEqual(['Name', 'Attendance']);
        expect(permission.read.conditions).toEqual({ Seats: { _eq: 4 } });
        expect(permission.update.writableFields).toEqual(['Attendance']);
        expect(permission.transitions).toEqual({ approve: { enabled: true } });
    });

    it('keeps a permission that holds a transition when every action is turned off', async () => {
        const onSubmit = await renderEditor(ROLE);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Allow read on Record' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Allow update on Record' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const { permissions } = submitted(onSubmit);
        expect(permissions).toHaveLength(1);
        expect(permissions[0].transitions).toEqual({ approve: { enabled: true } });
    });
});

describe('conditions and field limits', () => {
    async function expand(initial: RoleRequest = ROLE) {
        const onSubmit = await renderEditor(initial);
        fireEvent.click(screen.getByRole('button', { name: 'Conditions and field limits for Record' }));
        return onSubmit;
    }

    it('saves a condition that follows a reference beside the kept one', async () => {
        const onSubmit = await expand();
        const read = screen.getByText('Read only entries where').parentElement!;

        fireEvent.click(within(read).getByRole('button', { name: 'Add condition' }));
        fireEvent.change(within(read).getByLabelText('Condition 1 field'), { target: { value: 'Class.InstructorUser' } });
        fireEvent.change(within(read).getByLabelText('Condition 1 value'), { target: { value: '$CURRENT_USER' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        expect(submitted(onSubmit).permissions[0].read.conditions).toEqual({
            Seats: { _eq: 4 },
            'Class.InstructorUser': { _eq: '$CURRENT_USER' },
        });
    });

    it('will not save a key that follows two references, and says why', async () => {
        const onSubmit = await expand();
        const read = screen.getByText('Read only entries where').parentElement!;

        fireEvent.click(within(read).getByRole('button', { name: 'Add condition' }));
        fireEvent.change(within(read).getByLabelText('Condition 1 field'), { target: { value: 'Class.Teacher.User' } });

        expect(within(read).getByText(/One reference is followed, not two/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save role' })).toBeDisabled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('sends an empty list when a stored field limit is turned off, which is how the API removes it', async () => {
        const onSubmit = await expand();

        const limit = screen.getByRole('switch', { name: 'Read shows only some fields' });
        expect(limit).toBeChecked();
        fireEvent.click(limit);
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const [permission] = submitted(onSubmit).permissions;
        expect(permission.read.readableFields).toEqual([]);
        expect(permission.update.writableFields).toEqual(['Attendance']);
    });

    it('narrows a writable set by unticking a field', async () => {
        const onSubmit = await expand({
            ...ROLE,
            permissions: [{ ...ROLE.permissions[0], update: { enabled: true, writableFields: ['Attendance', 'Grade'] } }],
        });
        const update = screen.getByRole('switch', { name: 'Update sets only some fields' }).closest('div')!.parentElement!;

        fireEvent.click(within(update).getByRole('checkbox', { name: 'Grade' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        expect(submitted(onSubmit).permissions[0].update.writableFields).toEqual(['Attendance']);
    });

    it('is not offered against an API older than contract 6, which ignores field sets', async () => {
        __resetContractForTests();
        recordContractVersion('5');
        await renderEditor(ROLE);

        expect(screen.queryByRole('button', { name: 'Conditions and field limits for Record' })).toBeNull();
    });
});
