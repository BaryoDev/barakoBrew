import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { __resetContractForTests, recordContractVersion } from '@/lib/api-contract';
import { FieldMask, SensitivityLevel, type ContentTypeDefinition, type FieldDefinition } from '@/types/schema';

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

type TypeFacts = Pick<ContentTypeDefinition, 'name' | 'eventSourced' | 'uniqueness'>;

function renderChip(f: FieldDefinition, facts: Partial<TypeFacts> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <FieldSensitivityChip schema={{ name: 'staff', ...facts }} field={f} />
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
            visibleToRoles: [],
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
            visibleToRoles: [],
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

describe('the chip keeps what the field already has', () => {
    it('sends the current roles and mask back, since the API replaces them with what it is sent', async () => {
        const user = userEvent.setup();
        renderChip({
            ...field(SensitivityLevel.Sensitive),
            visibleToRoles: ['HR', 'Finance'],
            mask: FieldMask.Last4,
        });

        await user.click(screen.getByRole('button', { name: /sensitivity: Sensitive/ }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            sensitivity: 'Hidden',
            acknowledgeDisclosure: false,
            visibleToRoles: ['HR', 'Finance'],
            mask: 'Last4',
        });
    });

    it('sends no roles or mask on the way to Public, which refuses both', async () => {
        const user = userEvent.setup();
        renderChip({ ...field(SensitivityLevel.Hidden), visibleToRoles: ['HR'], mask: FieldMask.Redact });

        await user.click(screen.getByRole('button', { name: /sensitivity: Hidden/ }));
        await user.click(await screen.findByRole('button', { name: 'Make Public' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            sensitivity: 'Public',
            acknowledgeDisclosure: true,
            visibleToRoles: [],
        });
    });
});

describe('the chip never walks into a level the API refuses', () => {
    it('skips Members on a token field', async () => {
        const user = userEvent.setup();
        renderChip({ ...field(SensitivityLevel.Public), type: 'token' });

        await user.click(screen.getByRole('button', { name: /Change to Sensitive/ }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ sensitivity: 'Sensitive' });
    });

    it('is not pressable on a field a uniqueness rule names, and says why', () => {
        renderChip(field(SensitivityLevel.Public), {
            uniqueness: [{ name: 'one-per-salary', fields: ['salary'] }],
        });
        const chip = screen.getByRole('button', { name: /uniqueness rule/ }) as HTMLButtonElement;
        expect(chip.disabled).toBe(true);
        expect(chip.title).toMatch(/uniqueness rule/);
    });

    it('is not pressable on an event sourced type, and says why', () => {
        renderChip(field(SensitivityLevel.Public), { eventSourced: true });
        const chip = screen.getByRole('button', { name: /event sourced/ }) as HTMLButtonElement;
        expect(chip.disabled).toBe(true);
    });

    it('still lets a non-Public field on an event sourced type go back to Public', async () => {
        const user = userEvent.setup();
        renderChip(field(SensitivityLevel.Sensitive), { eventSourced: true });

        await user.click(screen.getByRole('button', { name: /Change to Public/ }));
        await user.click(await screen.findByRole('button', { name: 'Make Public' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
    });
});

describe('the toast after a change', () => {
    it('says it is applying when the change is still running on the type', async () => {
        const user = userEvent.setup();
        vi.mocked(api.put).mockResolvedValue({ data: { change: { status: 'Running' } } });
        renderChip(field(SensitivityLevel.Public));

        await user.click(screen.getByRole('button', { name: /sensitivity: Public/ }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/applying/);
    });

    it('says it is now the new level when the change completed', async () => {
        const user = userEvent.setup();
        vi.mocked(api.put).mockResolvedValue({ data: { change: { status: 'Completed' } } });
        renderChip(field(SensitivityLevel.Public));

        await user.click(screen.getByRole('button', { name: /sensitivity: Public/ }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(vi.mocked(toast.success).mock.calls[0][0]).toBe('Salary is now Members');
    });
});
