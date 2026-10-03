import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FieldDefinition, StateTransition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { TransitionActions } = await import('./transition-dialog');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';

const FIELDS: FieldDefinition[] = [
    { name: 'Amount', displayName: 'Amount', type: 'decimal', isRequired: true },
    { name: 'Reason', displayName: 'Reason', type: 'string', isRequired: false },
    { name: 'Note', displayName: 'Note', type: 'string', isRequired: false },
];

const TRANSITIONS: StateTransition[] = [
    { name: 'Approve', from: 'Submitted', to: 'Approved' },
    { name: 'Reject', from: 'Submitted', to: 'Draft', requiredFields: ['Reason'], optionalFields: ['Note'] },
];

function renderActions() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <TransitionActions entryId={ID} contentType="expense" transitions={TRANSITIONS} fields={FIELDS} />
        </QueryClientProvider>,
    );
}

describe('a transition', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.put).mockResolvedValue({ data: { message: 'Done' } });
    });

    it('that asks for nothing is made at once, with no data', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0]).toEqual([
            `/api/contents/${ID}/status`,
            { id: ID, transition: 'Approve' },
        ]);
    });

    it('that requires a field asks for it first and sends its value with the move', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

        const dialog = await screen.findByRole('dialog');
        expect(dialog.querySelector('#Reason')).not.toBeNull();
        expect(dialog.querySelector('#Note')).not.toBeNull();
        expect(dialog.querySelector('#Amount')).toBeNull();
        const confirm = screen.getAllByRole('button', { name: 'Reject' }).at(-1)!;
        expect(confirm).toBeDisabled();
        expect(api.put).not.toHaveBeenCalled();

        fireEvent.change(document.getElementById('Reason')!, { target: { value: 'Wrong amount' } });
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            id: ID,
            transition: 'Reject',
            data: { Reason: 'Wrong amount' },
        });
    });

    it('shows the API refusal in the dialog', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(
            Object.assign(new Error('Request failed with status code 400'), {
                isAxiosError: true,
                response: {
                    status: 400,
                    data: { errors: [{ name: 'generalErrors', reason: "'Reject' cannot be taken from 'Approved'." }] },
                },
            }),
        );
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        await screen.findByRole('dialog');
        fireEvent.change(document.getElementById('Reason')!, { target: { value: 'Late' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1)!);

        expect(await screen.findByRole('alert')).toHaveTextContent("'Reject' cannot be taken from 'Approved'.");
    });
});
