import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ContentStatus, SensitivityLevel } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');
const { MAX_REFERENCES, referenceList } = await import('./reference-list-field');

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const CY = '33333333-3333-4333-8333-333333333333';

const SPEAKERS = [
    { id: ANA, data: { Name: 'Ana' } },
    { id: BEN, data: { Name: 'Ben' } },
    { id: CY, data: { Name: 'Cy' } },
];

const FIELD: FieldDefinition = {
    name: 'Speakers',
    displayName: 'Speakers',
    type: 'reference',
    referenceType: 'speaker',
    multiple: true,
    isRequired: false,
};

function row(e: (typeof SPEAKERS)[number]) {
    return {
        ...e,
        contentType: 'speaker',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        status: ContentStatus.Published,
        sensitivity: SensitivityLevel.Public,
        version: 1,
    };
}

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [{ name: 'speaker', displayName: 'Speaker', fields: [] }], totalItems: 1 } } as never;
        }
        if (url === '/api/contents') {
            return { data: { items: SPEAKERS.map(row), totalItems: SPEAKERS.length, page: 1, pageSize: 20 } } as never;
        }
        if (url.startsWith('/api/contents/')) {
            const found = SPEAKERS.find((s) => s.id === url.slice('/api/contents/'.length));
            if (!found) throw new Error('Request failed');
            return { data: row(found), headers: {} } as never;
        }
        throw new Error(`unstubbed GET ${url}`);
    });
});

function Harness({ initial, saved }: { initial: unknown; saved: { current: unknown } }) {
    const [values, setValues] = useState<Record<string, unknown>>(initial === undefined ? {} : { Speakers: initial });
    return (
        <DynamicForm
            fields={[FIELD]}
            values={values}
            onChange={(next) => {
                saved.current = next.Speakers;
                setValues(next);
            }}
        />
    );
}

function renderList(initial?: unknown) {
    const saved: { current: unknown } = { current: initial };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <Harness initial={initial} saved={saved} />
        </QueryClientProvider>,
    );
    return saved;
}

async function add(name: string) {
    fireEvent.click(screen.getByRole('button', { name: /^Add Speaker/ }));
    const option = (await screen.findAllByRole('option')).find((o) => o.textContent?.includes(name))!;
    fireEvent.click(option);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('a reference field that holds several entries', () => {
    it('adds entries in the order they are picked', async () => {
        const saved = renderList();
        await waitFor(() => expect(screen.getByRole('button', { name: /^Add Speaker/ })).toBeInTheDocument());

        await add('Cy');
        await add('Ana');

        expect(saved.current).toEqual([CY, ANA]);
        const items = within(screen.getByRole('list', { name: 'Speakers' })).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items.map((i) => i.textContent?.trim().slice(0, 3))).toEqual(['Cy', 'Ana']);
    });

    it('moves an entry up and keeps the rest in order', async () => {
        const saved = renderList([ANA, BEN, CY]);

        fireEvent.click(await screen.findByRole('button', { name: 'Move Cy up' }));

        expect(saved.current).toEqual([ANA, CY, BEN]);
    });

    it('removes one entry and keeps the others', async () => {
        const saved = renderList([ANA, BEN]);

        fireEvent.click(await screen.findByRole('button', { name: 'Remove Ana' }));

        expect(saved.current).toEqual([BEN]);
    });

    it('will not add the same entry twice', async () => {
        renderList([ANA]);

        fireEvent.click(await screen.findByRole('button', { name: /^Add Speaker/ }));
        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(3);
        const ana = options.find((o) => o.textContent?.includes('Ana'))!;
        expect(ana).toHaveAttribute('aria-disabled', 'true');
        expect(ana).toHaveTextContent('Added');
    });

    it('stops adding at 100 entries', () => {
        const hundred = Array.from({ length: MAX_REFERENCES }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
        expect(hundred).toHaveLength(100);
        renderList(hundred);

        expect(screen.getByRole('button', { name: /^Add Speaker|^Add speaker/ })).toBeDisabled();
        expect(screen.getByText('A list holds at most 100 entries.')).toBeInTheDocument();
    });
});

describe('reading the stored value', () => {
    it('reads a single id stored before the field took a list as a list of one', () => {
        expect(referenceList(ANA)).toEqual([ANA]);
        expect(referenceList([ANA, BEN])).toEqual([ANA, BEN]);
        expect(referenceList(null)).toEqual([]);
    });
});
