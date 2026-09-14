import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { FieldOptionsDialog } = await import('./field-options-dialog');

const FIELD: FieldDefinition = {
    name: 'EntryType',
    displayName: 'Entry type',
    type: 'choice',
    isRequired: false,
    multiple: false,
    options: [
        { value: 'FUN', label: 'Fun run' },
        { value: 'COMPETE', label: 'Competitive' },
        { value: 'WALK', label: 'Walk' },
    ],
};

/** A 409 shaped as the API sends it: ProblemDetails with errors[].reason. */
function heldByEntries() {
    const reason =
        "3 entries hold 'WALK' in 'EntryType'. Removing it leaves those entries with a value the field no longer accepts, and each is refused on its next save until a value still offered is picked. Resend with force set to true to remove anyway.";
    return Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { status: 409, errors: [{ name: 'generalErrors', reason }] } },
    });
}

function renderDialog(onOpenChange = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <FieldOptionsDialog typeName="registration" field={FIELD} open onOpenChange={onOpenChange} />
        </QueryClientProvider>,
    );
    return onOpenChange;
}

describe('changing the options of a choice field', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the 409 with its entry count, and resends the same list with force on Remove anyway', async () => {
        vi.mocked(api.put)
            .mockRejectedValueOnce(heldByEntries())
            .mockResolvedValueOnce({
                data: {
                    name: 'registration',
                    field: 'EntryType',
                    options: FIELD.options!.slice(0, 2),
                    removed: ['WALK'],
                    entriesHoldingRemoved: 3,
                },
            });
        const onOpenChange = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Remove option 3' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save options' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent("3 entries hold 'WALK'");
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Remove anyway' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const expected = [
            { value: 'FUN', label: 'Fun run' },
            { value: 'COMPETE', label: 'Competitive' },
        ];
        const [url, first] = vi.mocked(api.put).mock.calls[0];
        expect(url).toBe('/api/content-types/registration/fields/EntryType/options');
        expect(first).toEqual({ options: expected, force: false });
        expect(vi.mocked(api.put).mock.calls[1][1]).toEqual({ options: expected, force: true });

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/3 entries hold a removed value/);
    });

    it('drops the confirmation when the list changes after the 409', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(heldByEntries());
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Remove option 3' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save options' }));
        await screen.findByRole('alert');

        fireEvent.change(screen.getByLabelText('Label for option 1'), { target: { value: '5K fun run' } });

        expect(screen.queryByRole('button', { name: 'Remove anyway' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save options' })).toBeEnabled();
    });

    it('sends a relabel and a reorder without force', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({
            data: { name: 'registration', field: 'EntryType', options: [], removed: [], entriesHoldingRemoved: 0 },
        });
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Move option 2 up' }));
        fireEvent.change(screen.getByLabelText('Label for option 1'), { target: { value: 'Race' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save options' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            options: [
                { value: 'COMPETE', label: 'Race' },
                { value: 'FUN', label: 'Fun run' },
                { value: 'WALK', label: 'Walk' },
            ],
            force: false,
        });
    });
});
