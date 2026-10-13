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
const { FieldCurrencyDialog } = await import('./field-currency-dialog');

const FIELD: FieldDefinition = { name: 'Fee', displayName: 'Fee', type: 'money', isRequired: false, currency: 'USD' };

/** A 409 shaped as the API sends it: ProblemDetails with errors[].reason. */
function refusal(name: string, reason: string) {
    return Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { status: 409, errors: [{ name, reason }] } },
    });
}

function renderDialog() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <FieldCurrencyDialog typeName="registration" field={FIELD} open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
    );
}

function saveAs(code: string) {
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Save currency' }));
}

describe('changing the currency of a money field', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('offers Save anyway on a 409 about the amounts entries hold', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(refusal('generalErrors', '4 entries hold amounts under another code.'));
        renderDialog();

        saveAs('EUR');

        expect(await screen.findByRole('alert')).toHaveTextContent('4 entries hold amounts under another code.');
        expect(screen.getByRole('button', { name: 'Save anyway' })).toBeInTheDocument();
    });

    it('shows a running field change as a refusal it does not offer to force', async () => {
        const reason = "'registration' has a field change running (3f2c). Try again when it completes.";
        vi.mocked(api.put).mockRejectedValueOnce(refusal('name', reason));
        renderDialog();

        saveAs('EUR');

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
        expect(screen.queryByRole('button', { name: 'Save anyway' })).not.toBeInTheDocument();
        expect(api.put).toHaveBeenCalledTimes(1);
    });
});
