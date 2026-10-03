import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SensitivityLevel, type ContentTypeDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select needs these to open in jsdom, as in field-editor.test.tsx.
beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

const { api } = await import('@/lib/api');
const { UniquenessDialog, UniquenessPanel } = await import('./uniqueness-panel');

const TYPE: ContentTypeDefinition = {
    name: 'timeentry',
    displayName: 'Time entry',
    fields: [
        { name: 'Note', displayName: 'Note', type: 'string', isRequired: false },
        { name: 'Email', displayName: 'Email', type: 'email', isRequired: false },
        { name: 'Day', displayName: 'Day', type: 'date', isRequired: false },
        {
            name: 'Salary',
            displayName: 'Salary',
            type: 'money',
            isRequired: false,
            sensitivity: SensitivityLevel.Sensitive,
        },
    ],
    lifecycle: {
        states: ['Open', 'Closed'],
        initialState: 'Open',
        transitions: [{ name: 'ClockOut', from: 'Open', to: 'Closed' }],
    },
};

/** A 409 shaped as the API sends it: ProblemDetails with errors[].reason. */
function sharedValues() {
    return Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: {
            status: 409,
            data: {
                status: 409,
                errors: [
                    {
                        name: 'generalErrors',
                        reason: "2 entries share their values under the rule 'OneOpenEntryPerTeacher' with another entry.",
                    },
                ],
            },
        },
    });
}

function wrap(node: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('the uniqueness rules dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('offers only Public single-value fields and the creator to compare', () => {
        wrap(<UniquenessDialog schema={TYPE} open onOpenChange={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));

        const boxes = screen.getAllByRole('checkbox');
        expect(boxes).toHaveLength(3);
        expect(screen.getByLabelText('Note')).toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('Created by')).toBeInTheDocument();
        // A date and a Sensitive field are refused by the API, so they are not offered.
        expect(screen.queryByLabelText('Day')).toBeNull();
        expect(screen.queryByLabelText('Salary')).toBeNull();
    });

    it('shows the 409 and resends the same rules with force on Save anyway', async () => {
        vi.mocked(api.put)
            .mockRejectedValueOnce(sharedValues())
            .mockResolvedValueOnce({
                data: {
                    name: 'timeentry',
                    uniqueness: [{ name: 'OneOpenEntryPerTeacher', fields: ['$createdBy'], whenState: 'Open' }],
                    duplicates: [{ rule: 'OneOpenEntryPerTeacher', entries: 2 }],
                },
            });
        const onOpenChange = vi.fn();
        const onSaved = vi.fn();
        wrap(<UniquenessDialog schema={TYPE} open onOpenChange={onOpenChange} onSaved={onSaved} />);

        fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
        fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'OneOpenEntryPerTeacher' } });
        fireEvent.click(screen.getByLabelText('Created by'));
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Counts entries' }), { key: 'ArrowDown' });
        const open = within(screen.getByRole('listbox'))
            .getAllByRole('option')
            .find((o) => o.textContent === 'While Open')!;
        fireEvent.keyDown(open, { key: 'Enter' });

        fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent("2 entries share their values under the rule 'OneOpenEntryPerTeacher'");
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const rules = [{ name: 'OneOpenEntryPerTeacher', fields: ['$createdBy'], whenState: 'Open' }];
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/timeentry/uniqueness');
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({ uniqueness: rules, force: false });
        expect(vi.mocked(api.put).mock.calls[1][1]).toEqual({ uniqueness: rules, force: true });
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith([{ rule: 'OneOpenEntryPerTeacher', entries: 2 }]));
    });

    it('sends an empty list when every rule is removed', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({ data: { name: 'timeentry', uniqueness: null, duplicates: [] } });
        wrap(
            <UniquenessDialog
                schema={{ ...TYPE, uniqueness: [{ name: 'OnePerEmail', fields: ['Email'] }] }}
                open
                onOpenChange={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Remove rule OnePerEmail' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({ uniqueness: [], force: false });
    });
});

describe('the uniqueness panel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists the entries sharing values under a rule, as links to them', async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: {
                items: [
                    { id: 'aaaaaaaa-0000-4000-8000-000000000001', createdAt: '2026-10-01T08:00:00Z' },
                    { id: 'aaaaaaaa-0000-4000-8000-000000000002', createdAt: '2026-10-01T09:00:00Z' },
                ],
                page: 1,
                pageSize: 20,
                totalItems: 2,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false,
            },
        });
        wrap(<UniquenessPanel schema={{ ...TYPE, uniqueness: [{ name: 'OnePerEmail', fields: ['Email'] }] }} />);

        expect(screen.getByText(/one entry per Email/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Entries sharing values' }));

        const links = await screen.findAllByRole('link');
        expect(links).toHaveLength(2);
        expect(links[0]).toHaveAttribute('href', '/content/aaaaaaaa-0000-4000-8000-000000000001');
        expect(vi.mocked(api.get).mock.calls[0][0]).toBe(
            '/api/content-types/timeentry/uniqueness/OnePerEmail/duplicates',
        );
    });
});
