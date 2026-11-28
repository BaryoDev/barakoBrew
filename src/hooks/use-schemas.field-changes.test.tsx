import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A field edit can start a field change on the type. The panel reads the changes under its own key,
 * so an edit has to invalidate that key as well or the new running change is missing until a reload.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useFieldChanges } = await import('./use-field-changes');
const {
    useAddField,
    useSetFieldCurrency,
    useSetFieldOptions,
    useSetFieldPresentation,
    useSetFieldSensitivity,
} = await import('./use-schemas');

function Harness() {
    const changes = useFieldChanges('article', 1);
    const sensitivity = useSetFieldSensitivity('article');
    const currency = useSetFieldCurrency('article', 'Price');
    const options = useSetFieldOptions('article', 'Status');
    const presentation = useSetFieldPresentation('article', 'Title');
    const add = useAddField('article');

    return (
        <div>
            <p>changes read: {changes.data ? changes.data.items.length : 'none'}</p>
            <button
                onClick={() =>
                    sensitivity.mutate({
                        field: 'Salary',
                        sensitivity: 'Sensitive',
                        acknowledgeDisclosure: false,
                        visibleToRoles: [],
                    })
                }
            >
                sensitivity
            </button>
            <button onClick={() => currency.mutate({ currency: 'PHP', scale: 2, force: false })}>currency</button>
            <button onClick={() => options.mutate({ options: [], force: true })}>options</button>
            <button onClick={() => presentation.mutate({ editor: null, section: null, role: null })}>
                presentation
            </button>
            <button onClick={() => add.mutate({ fieldName: 'Note', displayName: 'Note', type: 'string', isRequired: false })}>
                add
            </button>
        </div>
    );
}

const fieldChangeReads = () =>
    vi.mocked(api.get).mock.calls.filter(([url]) => String(url).endsWith('/field-changes')).length;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((async () => ({
        data: { items: [], page: 1, pageSize: 20, totalItems: 0 },
    })) as typeof api.get);
    vi.mocked(api.put).mockResolvedValue({ data: {} });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
});

describe('field edits and the field changes list', () => {
    it.each(['sensitivity', 'currency', 'options', 'presentation', 'add'])(
        'reads the changes again after %s is saved',
        async (button) => {
            const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={client}>
                    <Harness />
                </QueryClientProvider>,
            );
            await screen.findByText('changes read: 0');
            expect(fieldChangeReads()).toBe(1);

            await userEvent.click(screen.getByRole('button', { name: button }));

            await waitFor(() => expect(fieldChangeReads()).toBe(2));
        },
    );
});
