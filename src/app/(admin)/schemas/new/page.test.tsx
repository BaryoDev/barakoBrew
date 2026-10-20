import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn().mockResolvedValue({ data: { items: [] } }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/schema/field-editor', () => ({
    FieldEditor: ({ onChange }: { onChange: (f: unknown[]) => void }) => (
        <button
            type="button"
            onClick={() => onChange([{ name: 'Note', displayName: 'Note', type: 'string', isRequired: false }])}
        >
            stub add field
        </button>
    ),
}));

vi.mock('@/components/schema/lifecycle-editor', () => ({
    LifecycleEditor: ({ onChange }: { onChange: (v: unknown) => void }) => (
        <>
            <button
                type="button"
                onClick={() =>
                    onChange({
                        states: ['Recorded', 'Approved'],
                        initialState: 'Recorded',
                        transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
                    })
                }
            >
                stub set lifecycle
            </button>
            <button
                type="button"
                onClick={() => onChange({ states: ['bad'], initialState: 'bad', transitions: [] })}
            >
                stub set bad lifecycle
            </button>
        </>
    ),
}));

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

const { api } = await import('@/lib/api');
const { default: NewSchemaPage } = await import('./page');

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <NewSchemaPage />
        </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Time entry' } });
    fireEvent.click(screen.getByText('stub add field'));
}

const LIFECYCLE = {
    states: ['Recorded', 'Approved'],
    initialState: 'Recorded',
    transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
};

describe('New content type page', () => {
    it('sends the lifecycle it was given when the type is created', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: '1', name: 'time-entry' } });
        renderPage();
        fireEvent.click(screen.getByText('stub set lifecycle'));
        fireEvent.click(screen.getByRole('button', { name: 'Create content type' }));
        await waitFor(() => expect(api.post).toHaveBeenCalled());
        const body = vi.mocked(api.post).mock.calls.at(-1)![1] as Record<string, unknown>;
        expect(body.lifecycle).toEqual(LIFECYCLE);
    });

    it('sends no lifecycle when none was declared', async () => {
        vi.mocked(api.post).mockClear();
        vi.mocked(api.post).mockResolvedValue({ data: { id: '1', name: 'time-entry' } });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Create content type' }));
        await waitFor(() => expect(api.post).toHaveBeenCalled());
        const body = vi.mocked(api.post).mock.calls.at(-1)![1] as Record<string, unknown>;
        expect(body.lifecycle).toBeUndefined();
    });

    it('will not create a type whose lifecycle the API would refuse', () => {
        vi.mocked(api.post).mockClear();
        renderPage();
        fireEvent.click(screen.getByText('stub set bad lifecycle'));
        expect(screen.getByRole('button', { name: 'Create content type' })).toBeDisabled();
        expect(api.post).not.toHaveBeenCalled();
    });
});
