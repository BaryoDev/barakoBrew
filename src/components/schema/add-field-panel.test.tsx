import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import type { FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { AddFieldPanel } = await import('./add-field-panel');

const EXISTING: FieldDefinition[] = [{ name: 'Title', displayName: 'Title', type: 'string', isRequired: true }];

function renderPanel() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <AddFieldPanel
                typeName="article"
                fields={EXISTING}
                contentTypes={[{ name: 'author', displayName: 'Authors' }]}
            />
        </QueryClientProvider>,
    );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Add a field' }));
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { contentType: 'article', added: 'Summary', fields: [] } });
});

describe('the add a field panel', () => {
    it('is closed until opened, then offers every field type in groups', async () => {
        const user = userEvent.setup();
        renderPanel();
        expect(screen.queryByRole('region', { name: 'Add a field' })).toBeNull();

        await open(user);

        expect(screen.getByRole('region', { name: 'Add a field' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Long text' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Choice' })).toBeTruthy();
    });

    it('posts the field with a PascalCase API name made from the label', async () => {
        const user = userEvent.setup();
        renderPanel();
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Long text' }));
        await user.type(screen.getByLabelText('Label'), 'short summary');
        expect((screen.getByLabelText('API name') as HTMLInputElement).value).toBe('ShortSummary');
        await user.click(screen.getByRole('button', { name: 'Add field' }));

        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/content-types/article/fields');
        expect(vi.mocked(api.post).mock.calls[0][1]).toEqual({
            fieldName: 'ShortSummary',
            displayName: 'short summary',
            type: 'text',
            isRequired: false,
        });
    });

    it('will not add a name the type already has, and sends nothing', async () => {
        const user = userEvent.setup();
        renderPanel();
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Text' }));
        await user.type(screen.getByLabelText('Label'), 'title');

        expect(screen.getByText('This type already has a field with that name.')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
    });

    it('needs a target for a reference and sends it as referenceType', async () => {
        const user = userEvent.setup();
        renderPanel();
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Reference' }));
        await user.type(screen.getByLabelText('Label'), 'Writer');
        expect((screen.getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(true);
        await user.selectOptions(screen.getByLabelText('Points at'), 'author');
        await user.click(screen.getByRole('button', { name: 'Add field' }));

        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ type: 'reference', referenceType: 'author' });
    });

    it('shows the API refusal as it words it and keeps the form', async () => {
        const user = userEvent.setup();
        const response = {
            status: 400,
            data: { message: '"article" already has 12 entries with no "Summary".' },
        } as AxiosResponse;
        vi.mocked(api.post).mockRejectedValue(new AxiosError('bad', '400', undefined, undefined, response));
        renderPanel();
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Long text' }));
        await user.type(screen.getByLabelText('Label'), 'Summary');
        await user.click(screen.getByRole('switch', { name: 'Required' }));
        await user.click(screen.getByRole('button', { name: 'Add field' }));

        expect((await screen.findByRole('alert')).textContent).toContain('already has 12 entries');
        expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ isRequired: true });
        expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Summary');
    });
});
