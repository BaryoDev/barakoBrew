import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { default: EmailTemplatePage } = await import('./page');

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const BOOKING_ID = '11111111-1111-1111-1111-111111111111';

function page<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

// As GET /api/contents/{id} returns an entry of the email blueprint's template type.
const TEMPLATE = {
    id: ID,
    contentType: 'email-template',
    status: 'Draft',
    sensitivity: 'Public',
    version: 4,
    createdAt: '',
    updatedAt: '',
    data: { Name: 'Welcome', Slug: 'welcome', Subject: 'Hello', Body: 'Thanks for booking.', Locale: 'en' },
};

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.get).mockImplementation((async (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === `/api/contents/${ID}`) return { data: TEMPLATE, headers: { etag: '"4"' } };
        if (url === '/api/content-types') {
            return {
                data: page([
                    { name: 'booking', displayName: 'Booking', fields: [] },
                    { name: 'email-template', displayName: 'Email template', fields: [] },
                ]),
            };
        }
        if (url === '/api/contents' && config?.params?.contentType === 'email-layout') return { data: page([]) };
        if (url === '/api/contents' && config?.params?.contentType === 'booking') {
            return {
                data: page([
                    { id: '22222222-2222-2222-2222-222222222222', contentType: 'booking', status: 'Published', data: { Title: 'Bea' } },
                    { id: BOOKING_ID, contentType: 'booking', status: 'Published', data: { Title: 'Ana' } },
                ]),
            };
        }
        if (url === '/api/workflows/variables') {
            return {
                data: {
                    systemVariables: [{ name: '{{createdBy.email}}', description: 'The author', example: '', type: 'string' }],
                    dataFields: [{ name: '{{data.Title}}', description: 'Title', example: '', type: 'string' }],
                },
            };
        }
        throw new Error(`unexpected GET ${url}`);
    }) as typeof api.get);
});

function renderEditor() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const params = Object.assign(Promise.resolve({ id: ID }), { status: 'fulfilled' as const, value: { id: ID } });
    render(
        <QueryClientProvider client={client}>
            <React.Suspense fallback={null}>
                <EmailTemplatePage params={params} />
            </React.Suspense>
        </QueryClientProvider>
    );
}

async function choose(combobox: string, option: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: combobox }), { key: 'ArrowDown' });
    const item = await within(screen.getByRole('listbox')).findByRole('option', { name: option });
    fireEvent.keyDown(item, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
}

describe('the email template editor', () => {
    it('inserts a placeholder at the cursor in the body, and saves the fields it edits beside the rest', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 5 }, headers: {} });
        renderEditor();
        const body = (await screen.findByLabelText('Body')) as HTMLTextAreaElement;
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('Sent for entries of type', 'Booking');

        body.setSelectionRange('Thanks'.length, 'Thanks'.length);
        fireEvent.click(await screen.findByRole('button', { name: 'Insert {{data.Title}}' }));
        expect(body).toHaveValue('Thanks{{data.Title}} for booking.');

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0]).toEqual([
            `/api/contents/${ID}`,
            {
                id: ID,
                data: { Name: 'Welcome', Slug: 'welcome', Subject: 'Hello', Body: 'Thanks{{data.Title}} for booking.', Locale: 'en' },
                status: 'Draft',
                version: 4,
            },
            { headers: { 'If-Match': '"4"' } },
        ]);
    });

    it('inserts into the subject when the subject is chosen', async () => {
        renderEditor();
        const subject = (await screen.findByLabelText('Subject')) as HTMLInputElement;
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('Sent for entries of type', 'Booking');

        fireEvent.click(await screen.findByRole('radio', { name: 'Subject' }));
        subject.setSelectionRange(5, 5);
        fireEvent.click(screen.getByRole('button', { name: 'Insert {{createdBy.email}}' }));

        expect(subject).toHaveValue('Hello{{createdBy.email}}');
        expect(screen.getByLabelText('Body')).toHaveValue('Thanks for booking.');
    });

    it('previews against the chosen entry and shows what the API rendered', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: {
                subject: 'Hello Ana',
                html: '<!DOCTYPE html><p>Thanks Ana</p>',
                status: 'Draft',
                sendable: false,
                problem: 'The template is Draft. Only a published template is sent.',
                warnings: [{ field: 'Body', message: "'{{nope}}' is sent as written." }],
                notes: [],
            },
        });
        renderEditor();
        await screen.findByLabelText('Body');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('Sent for entries of type', 'Booking');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/contents', expect.objectContaining({ params: expect.objectContaining({ contentType: 'booking' }) })));
        await choose('Against the entry', 'Ana');

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([`/api/email-templates/${ID}/preview`, { entryId: BOOKING_ID }]);
        expect(await screen.findByText('Hello Ana')).toBeInTheDocument();
        expect(screen.getByText('The template is Draft. Only a published template is sent.')).toBeInTheDocument();
        const warnings = within(screen.getByRole('list', { name: 'Preview warnings' })).getAllByRole('listitem');
        expect(warnings).toHaveLength(1);
        expect(screen.getByTitle('Email preview')).toHaveAttribute('srcdoc', '<!DOCTYPE html><p>Thanks Ana</p>');
        expect(screen.getByTitle('Email preview')).toHaveAttribute('sandbox', '');
    });

    it('keeps the preview entry and the last preview through a save that brings back a new version', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { subject: 'Hello Ana', html: '<p>Thanks Ana</p>', status: 'Draft', sendable: false, problem: null, warnings: [], notes: [] },
        });
        let stored = TEMPLATE;
        const get = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, config?: { params?: Record<string, unknown> }) => {
            if (url === `/api/contents/${ID}`) return { data: stored, headers: { etag: `"${stored.version}"` } };
            return get(url, config);
        }) as typeof api.get);
        vi.mocked(api.put).mockImplementation((async (_url: string, body: { data: typeof TEMPLATE.data }) => {
            stored = { ...TEMPLATE, version: 5, data: body.data };
            return { data: { id: ID, version: 5 }, headers: {} };
        }) as unknown as typeof api.put);

        renderEditor();
        const subject = (await screen.findByLabelText('Subject')) as HTMLInputElement;
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('Sent for entries of type', 'Booking');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/contents', expect.objectContaining({ params: expect.objectContaining({ contentType: 'booking' }) })));
        await choose('Against the entry', 'Ana');
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(await screen.findByText('Hello Ana')).toBeInTheDocument();

        fireEvent.change(subject, { target: { value: 'Hi' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue('Hi'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());

        expect(screen.getByRole('combobox', { name: 'Sent for entries of type' })).toHaveTextContent('Booking');
        expect(screen.getByRole('combobox', { name: 'Against the entry' })).toHaveTextContent('Ana');
        expect(screen.getByText('Hello Ana')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
        expect(vi.mocked(api.post).mock.calls[1]).toEqual([`/api/email-templates/${ID}/preview`, { entryId: BOOKING_ID }]);
    });
});
