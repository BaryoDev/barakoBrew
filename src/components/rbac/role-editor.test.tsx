import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoleRequest } from '@/types/rbac';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

// Radix's checkbox and switch measure themselves, and jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { AxiosError, AxiosHeaders } = await import('axios');
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
    vi.mocked(api.post).mockReset();
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

describe('a role this caller may not change', () => {
    it('says why and offers no save, since the API would answer 403', async () => {
        const onSubmit = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor
                    initial={ROLE}
                    submitLabel="Save role"
                    locked="This is a platform role."
                    isPending={false}
                    onSubmit={onSubmit}
                    onCancel={() => {}}
                />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByText('Record')).toBeInTheDocument());

        expect(screen.getByRole('note')).toHaveTextContent('This is a platform role.');
        const save = screen.getByRole('button', { name: 'Save role' });
        expect(save).toBeDisabled();
        fireEvent.submit(save.closest('form')!);
        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe('platform capabilities for a caller without manage_platform_roles, against contract 8', () => {
    async function renderWith(canAddPlatformCapabilities: boolean, systemCapabilities: string[]) {
        const onSubmit = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor
                    initial={{ ...ROLE, systemCapabilities }}
                    submitLabel="Save role"
                    canAddPlatformCapabilities={canAddPlatformCapabilities}
                    isPending={false}
                    onSubmit={onSubmit}
                    onCancel={() => {}}
                />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByText('Record')).toBeInTheDocument());
        return onSubmit;
    }

    it('cannot tick one the role does not hold, since the API refuses adding it', async () => {
        await renderWith(false, []);

        expect(screen.getByRole('checkbox', { name: 'Manage tenants' })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Manage platform roles' })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Manage settings' })).toBeEnabled();
    });

    it('keeps one the role already holds, and can untick it, since only additions are refused', async () => {
        const onSubmit = await renderWith(false, ['manage_roles']);

        const held = screen.getByRole('checkbox', { name: 'Manage roles' });
        expect(held).toBeEnabled();
        expect(held).toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
        expect(submitted(onSubmit).systemCapabilities).toEqual(['manage_roles']);
    });

    it('does not add one typed into Other capabilities', async () => {
        const onSubmit = await renderWith(false, []);

        fireEvent.change(screen.getByLabelText('Other capabilities'), { target: { value: '*' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        expect(submitted(onSubmit).systemCapabilities).toEqual([]);
    });

    it('offers every one when the caller may add them, or the API reports no owners', async () => {
        await renderWith(true, []);

        expect(screen.getByRole('checkbox', { name: 'Manage tenants' })).toBeEnabled();
    });
});

describe('transition permissions', () => {
    const ABSENCE = {
        name: 'absence',
        displayName: 'Absence',
        fields: [{ name: 'Reason', displayName: 'Reason', type: 'string', isRequired: false }],
        lifecycle: {
            states: ['Recorded', 'Explained', 'Approved'],
            initialState: 'Recorded',
            transitions: [
                { name: 'Explain', from: 'Recorded', to: 'Explained' },
                { name: 'Approve', from: 'Explained', to: 'Approved' },
            ],
        },
    };

    async function openAbsence(initial?: RoleRequest) {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [ABSENCE], page: 1, pageSize: 20, totalItems: 1 } });
        const onSubmit = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor initial={initial} submitLabel="Save role" isPending={false} onSubmit={onSubmit} onCancel={() => {}} />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByText('Absence')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Teacher' } });
        fireEvent.click(screen.getByRole('button', { name: 'Conditions and field limits for Absence' }));
        return onSubmit;
    }

    it('lets a role run a named transition on rows matching a condition, with no CRUD action on', async () => {
        const onSubmit = await openAbsence();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Run Explain on Absence' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
        fireEvent.change(screen.getByLabelText('Condition 1 field'), { target: { value: 'CreatedBy' } });
        fireEvent.change(screen.getByLabelText('Condition 1 value'), { target: { value: '$CURRENT_USER' } });
        const sentence = 'Teacher can run Explain on Absence where CreatedBy is the current user.';
        // Said under the rule in the editor, and again in the rail.
        expect(within(screen.getByLabelText('Name').closest('form')!).getByText(sentence)).toBeInTheDocument();
        expect(within(screen.getByRole('complementary', { name: 'Reads back as' })).getByText(sentence)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const [permission] = submitted(onSubmit).permissions;
        expect(permission.contentTypeSlug).toBe('absence');
        expect(permission.transitions).toEqual({
            Explain: { enabled: true, conditions: { CreatedBy: { _eq: '$CURRENT_USER' } } },
        });
        expect(permission.read.enabled).toBe(false);
    });

    it('turns a stored transition off and keeps its other rule', async () => {
        const onSubmit = await openAbsence({
            name: 'Head',
            systemCapabilities: [],
            permissions: [
                {
                    contentTypeSlug: 'absence',
                    create: { enabled: false },
                    read: { enabled: true },
                    update: { enabled: false },
                    delete: { enabled: false },
                    transitions: { approve: { enabled: true }, Explain: { enabled: true } },
                },
            ],
        });

        const approve = screen.getByRole('checkbox', { name: 'Run Approve on Absence' });
        expect(approve).toBeChecked();
        fireEvent.click(approve);
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const [permission] = submitted(onSubmit).permissions;
        expect(permission.transitions).toEqual({ approve: { enabled: false }, Explain: { enabled: true } });
    });

    it('keeps the condition on a transition whose name holds a pipe', async () => {
        ABSENCE.lifecycle.transitions.push({ name: 'Sign|Off', from: 'Approved', to: 'Approved' });
        const onSubmit = await openAbsence();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Run Sign|Off on Absence' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
        fireEvent.change(screen.getByLabelText('Condition 1 field'), { target: { value: 'CreatedBy' } });
        fireEvent.change(screen.getByLabelText('Condition 1 value'), { target: { value: '$CURRENT_USER' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save role' }));

        const [permission] = submitted(onSubmit).permissions;
        expect(permission.transitions).toEqual({
            'Sign|Off': { enabled: true, conditions: { CreatedBy: { _eq: '$CURRENT_USER' } } },
        });
    });
});

describe('the Reads back as rail', () => {
    it('says nothing is granted for a new role, then follows the grid and the name as they change', async () => {
        await renderEditor();
        const rail = screen.getByRole('complementary', { name: 'Reads back as' });
        expect(within(rail).getByText('Nothing is granted yet.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Teacher' } });
        fireEvent.click(screen.getByLabelText('Allow read on Record'));
        expect(within(rail).getByText('Teacher can read every Record.')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Allow update on Record'));
        expect(within(rail).getByText('Teacher can read and update every Record.')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Allow read on Record'));
        fireEvent.click(screen.getByLabelText('Allow update on Record'));
        expect(within(rail).getByText('Nothing is granted yet.')).toBeInTheDocument();
    });

    it('is drawn for a role this caller may not change', async () => {
        const onSubmit = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor initial={ROLE} locked="Locked." submitLabel="Save role" isPending={false} onSubmit={onSubmit} onCancel={() => {}} />
            </QueryClientProvider>,
        );
        // The type's display name arrives with the content types, so wait for it.
        await waitFor(() => expect(screen.getByText('Record')).toBeInTheDocument());
        const rail = screen.getByRole('complementary', { name: 'Reads back as' });
        expect(within(rail).getByText('Teacher can run approve on every Record.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save role' })).toBeDisabled();
    });
});

describe('the Preview as panel', () => {
    const USER = { id: '11111111-1111-1111-1111-111111111111', username: 'marta', email: 'm@example.com', roleIds: [], groupIds: [], createdAt: '' };

    function refusal(status: number, data: unknown = {}) {
        return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
            status,
            statusText: '',
            data,
            headers: {},
            config: { headers: new AxiosHeaders() },
        });
    }

    async function renderWithPreview(roleId?: string, initial?: RoleRequest) {
        vi.mocked(api.get).mockImplementation(async (url: string) => ({
            data:
                url === '/api/users'
                    ? { items: [USER], page: 1, pageSize: 100, totalItems: 1 }
                    : { items: [RECORD], page: 1, pageSize: 20, totalItems: 1 },
        }));
        recordContractVersion('15');
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor roleId={roleId} initial={initial} submitLabel="Save role" isPending={false} onSubmit={vi.fn()} onCancel={() => {}} />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByRole('option', { name: 'marta' })).toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole('option', { name: 'Record' })).toBeInTheDocument());
    }

    function pick() {
        fireEvent.change(screen.getByLabelText('User'), { target: { value: USER.id } });
        fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'record' } });
    }

    it('sends roleId, name and capabilities from the editor state when editing a stored role', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { items: [] } });
        await renderWithPreview('role-9', ROLE);
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Teacher B' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Read Sensitive fields' }));
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
        expect(url).toBe('/api/roles/preview');
        expect(body.roleId).toBe('role-9');
        expect(body.name).toBe('Teacher B');
        expect(body.userId).toBe(USER.id);
        expect(body.contentType).toBe('record');
        expect(body.systemCapabilities).toEqual(['view_sensitive']);
        expect(body.permissions).toEqual(ROLE.permissions);
    });

    it('leaves roleId out for a role that is not saved yet', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { items: [] } });
        await renderWithPreview();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nurse' } });
        fireEvent.click(screen.getByLabelText('Allow read on Record'));
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect('roleId' in body).toBe(false);
        expect(body.name).toBe('Nurse');
        expect(body.systemCapabilities).toEqual([]);
        expect((body.permissions as { contentTypeSlug: string }[]).map((p) => p.contentTypeSlug)).toEqual(['record']);
    });

    it('says nothing is saved', async () => {
        await renderWithPreview();
        expect(screen.getByText(/Nothing is saved\./)).toBeInTheDocument();
    });

    it('shows the reason and the failed condition for a hidden entry, and the fields of a visible one', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: {
                items: [
                    { id: 'a', title: 'Hidden one', visible: false, reason: 'condition not met', condition: '{"Seats":{"_eq":4}}', readableFields: null },
                    { id: 'b', title: 'Shown one', visible: true, reason: null, condition: null, readableFields: ['Name', 'Grade'] },
                ],
            },
        });
        await renderWithPreview('role-9', ROLE);
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('Hidden one')).toBeInTheDocument();
        expect(screen.getByText('Hidden')).toBeInTheDocument();
        expect(screen.getByText('The read condition is not met by this entry.')).toBeInTheDocument();
        expect(screen.getByText('{"Seats":{"_eq":4}}')).toBeInTheDocument();
        expect(screen.getByText('Visible')).toBeInTheDocument();
        expect(screen.getByText('Name, Grade')).toBeInTheDocument();
    });

    it('shows a readable message for a 403', async () => {
        vi.mocked(api.post).mockRejectedValue(refusal(403));
        await renderWithPreview('role-9', ROLE);
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('You cannot preview this role.');
        expect(screen.getByRole('alert')).toHaveTextContent('manage_platform_roles');
    });

    it('shows a readable message for a 404', async () => {
        vi.mocked(api.post).mockRejectedValue(refusal(404));
        await renderWithPreview('role-9', ROLE);
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That user or role was not found.');
    });

    it('is not offered against contract 14, which has no preview route', async () => {
        await renderWithPreview('role-9', ROLE);
        expect(screen.getByRole('heading', { name: 'Preview as' })).toBeInTheDocument();
        cleanup();
        __resetContractForTests();
        recordContractVersion('14');
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <RoleEditor roleId="role-9" initial={ROLE} submitLabel="Save role" isPending={false} onSubmit={vi.fn()} onCancel={() => {}} />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByText('Record')).toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: 'Preview as' })).toBeNull();
    });

    it('clears the old entries when the user changes after a run', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { items: [{ id: 'a', title: 'First entry', visible: true, reason: null, condition: null, readableFields: null }] },
        });
        await renderWithPreview('role-9', ROLE);
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(await screen.findByText('First entry')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('User'), { target: { value: '' } });
        expect(screen.queryByText('First entry')).toBeNull();
    });

    it('disables Preview while a condition row has a problem, and says why', async () => {
        await renderWithPreview('role-9', ROLE);
        pick();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'Conditions and field limits for Record' }));
        const read = screen.getByText('Read only entries where').parentElement!;
        fireEvent.click(within(read).getByRole('button', { name: 'Add condition' }));
        fireEvent.change(within(read).getByLabelText('Condition 1 field'), { target: { value: 'Class.Teacher.User' } });

        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
        expect(screen.getByText('Fix the condition marked above first.')).toBeInTheDocument();
    });

    it('shows a reason it does not know exactly as the server sent it', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { items: [{ id: 'a', title: 'Odd one', visible: false, reason: 'frozen by policy', condition: null, readableFields: null }] },
        });
        await renderWithPreview('role-9', ROLE);
        pick();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('frozen by policy')).toBeInTheDocument();
    });
});
