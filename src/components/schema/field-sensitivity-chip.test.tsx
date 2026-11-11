import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { __resetContractForTests, recordContractVersion } from '@/lib/api-contract';
import { SensitivityLevel, type FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { FieldSensitivityChip, isLowering, nextSensitivity } = await import('./field-sensitivity-chip');

const field = (sensitivity?: SensitivityLevel): FieldDefinition => ({
    name: 'Salary',
    displayName: 'Salary',
    type: 'money',
    isRequired: false,
    sensitivity,
});

function renderChip(f: FieldDefinition) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <FieldSensitivityChip typeName="staff" field={f} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    __resetContractForTests();
    recordContractVersion('14');
    vi.mocked(api.put).mockResolvedValue({ data: { name: 'staff', field: 'Salary', from: 'Public', to: 'Members' } });
});

describe('the sensitivity order', () => {
    const all = [SensitivityLevel.Public, SensitivityLevel.Members, SensitivityLevel.Sensitive, SensitivityLevel.Hidden];

    it('moves one level more restricted per press and wraps from Hidden to Public', () => {
        expect(nextSensitivity(SensitivityLevel.Public, all)).toBe(SensitivityLevel.Members);
        expect(nextSensitivity(SensitivityLevel.Members, all)).toBe(SensitivityLevel.Sensitive);
        expect(nextSensitivity(SensitivityLevel.Sensitive, all)).toBe(SensitivityLevel.Hidden);
        expect(nextSensitivity(SensitivityLevel.Hidden, all)).toBe(SensitivityLevel.Public);
    });

    it('skips Members against an API that does not offer it', () => {
        const without = all.filter((l) => l !== SensitivityLevel.Members);
        expect(nextSensitivity(SensitivityLevel.Public, without)).toBe(SensitivityLevel.Sensitive);
    });

    it('calls a move to a wider audience lowering', () => {
        expect(isLowering(SensitivityLevel.Hidden, SensitivityLevel.Public)).toBe(true);
        expect(isLowering(SensitivityLevel.Public, SensitivityLevel.Members)).toBe(false);
    });
});

describe('the sensitivity chip', () => {
    it('shows the level and is a button that names the level it would move to', () => {
        renderChip(field(SensitivityLevel.Sensitive));
        const chip = screen.getByRole('button', { name: /Salary sensitivity: Sensitive\. Change to Hidden/ });
        expect(chip.textContent).toBe('Sensitive');
    });

    it('treats a field with no level as Public', () => {
        renderChip(field(undefined));
        expect(screen.getByRole('button', { name: /sensitivity: Public/ })).toBeTruthy();
    });

    it('raises a level with PUT .../sensitivity and no disclosure acknowledgement', async () => {
        const user = userEvent.setup();
        renderChip(field(SensitivityLevel.Public));

        await user.click(screen.getByRole('button', { name: /sensitivity: Public/ }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/staff/fields/Salary/sensitivity');
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            sensitivity: 'Members',
            acknowledgeDisclosure: false,
        });
    });

    it('asks before lowering and sends the acknowledgement only once it is given', async () => {
        const user = userEvent.setup();
        renderChip(field(SensitivityLevel.Hidden));

        await user.click(screen.getByRole('button', { name: /sensitivity: Hidden/ }));
        expect(api.put).not.toHaveBeenCalled();
        await user.click(await screen.findByRole('button', { name: 'Make Public' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            sensitivity: 'Public',
            acknowledgeDisclosure: true,
        });
    });

    it('sends nothing when the lowering is cancelled', async () => {
        const user = userEvent.setup();
        renderChip(field(SensitivityLevel.Hidden));

        await user.click(screen.getByRole('button', { name: /sensitivity: Hidden/ }));
        await user.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(api.put).not.toHaveBeenCalled();
    });

    it('shows the API refusal in a toast', async () => {
        const user = userEvent.setup();
        vi.mocked(api.put).mockRejectedValue(new Error('boom'));
        renderChip(field(SensitivityLevel.Public));

        await user.click(screen.getByRole('button', { name: /sensitivity: Public/ }));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });
});
