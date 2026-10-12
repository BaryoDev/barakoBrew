import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkflowActionMetadata } from '@/types/workflow';

/**
 * The new workflow form, for the barakoPress cache invalidation workflow: a Published trigger and
 * one Webhook action with a Url and a Secret. Before this, neither half could be entered.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { api } = await import('@/lib/api');
const { default: NewWorkflowPage } = await import('./page');

// As GET /api/workflows/actions returns WebhookAction on barakoCMS master.
const ACTIONS: WorkflowActionMetadata[] = [
    {
        type: 'Webhook',
        description: 'Send HTTP POST requests to external webhooks, signed when a Secret is set',
        requiredParameters: ['Url'],
        exampleConfiguration:
            '{"Type":"Webhook","Parameters":{"Url":"https://example.com/webhook","Secret":"a shared secret, optional"}}',
    },
];

function page<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockImplementation((async (url: string) => {
        if (url === '/api/content-types') return { data: page([{ name: 'post', displayName: 'Post', fields: [] }]) };
        if (url === '/api/workflows/actions') return { data: ACTIONS };
        if (url === '/api/workflows/variables') return { data: { systemVariables: [], dataFields: [] } };
        throw new Error(`unexpected GET ${url}`);
    }) as typeof api.get);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewWorkflowPage />, {
        wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
    });
}

/** Radix opens from the keyboard, which jsdom can drive, and selects on Enter. */
async function choose(combobox: string, option: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: combobox }), { key: 'ArrowDown' });
    const item = await within(screen.getByRole('listbox')).findByRole('option', { name: option });
    fireEvent.keyDown(item, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
}

async function addWebhook() {
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
    await choose('Add an action', 'Webhook');
    return screen.findByLabelText(/^Url/);
}

describe('the action picker', () => {
    const grouped: WorkflowActionMetadata[] = [
        { ...ACTIONS[0], group: 'Delivery' },
        { type: 'Conditional', description: '', requiredParameters: ['Condition'], exampleConfiguration: '{}', group: 'Flow' },
        { type: 'Email', description: '', requiredParameters: ['To'], exampleConfiguration: '{}', group: 'Comms' },
        { type: 'Custom', description: '', requiredParameters: ['Thing'], exampleConfiguration: '{}', group: null },
    ];

    function serve(actions: WorkflowActionMetadata[]) {
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, ...rest: unknown[]) =>
            url === '/api/workflows/actions'
                ? { data: actions }
                : (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest)) as typeof api.get);
    }

    async function openPicker() {
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Add an action' }), { key: 'ArrowDown' });
        return within(await screen.findByRole('listbox'));
    }

    it('lists the kinds under their groups in library order, with an ungrouped kind under Other', async () => {
        serve(grouped);
        renderPage();
        const listbox = await openPicker();

        const groups = listbox.getAllByRole('group');
        expect(groups).toHaveLength(4);
        expect(groups.map((g) => [
            g.querySelector('[data-slot="select-label"]')?.textContent,
            within(g).getAllByRole('option').map((o) => o.textContent),
        ])).toEqual([
            ['Delivery', ['Webhook']],
            ['Comms', ['Email']],
            ['Flow', ['Conditional']],
            ['Other', ['Custom']],
        ]);
    });

    it('still offers every kind, without group headings, when the API sends no group', async () => {
        serve([
            ACTIONS[0],
            { type: 'Email', description: '', requiredParameters: ['To'], exampleConfiguration: '{}' },
        ]);
        renderPage();
        const listbox = await openPicker();

        const options = listbox.getAllByRole('option');
        expect(options).toHaveLength(2);
        expect(options.map((o) => o.textContent)).toEqual(['Webhook', 'Email']);
        expect(document.querySelectorAll('[data-slot="select-label"]')).toHaveLength(0);
    });

    it('adds a kind picked from a group, with its own required parameters', async () => {
        serve(grouped);
        renderPage();
        await openPicker();
        fireEvent.keyDown(screen.getByRole('option', { name: 'Custom' }), { key: 'Enter' });

        expect(await screen.findByLabelText(/^Thing/)).toBeInTheDocument();
    });
});

describe('the new workflow form', () => {
    it('offers Published as a trigger, alongside Created and Updated', async () => {
        renderPage();
        fireEvent.keyDown(screen.getByRole('combobox', { name: /is$/ }), { key: 'ArrowDown' });
        const options = within(await screen.findByRole('listbox')).getAllByRole('option');

        expect(options).toHaveLength(3);
        expect(options.map((o) => o.textContent)).toEqual(['Created', 'Updated', 'Published']);
    });

    it('renders the Webhook Secret as a masked, optional input', async () => {
        renderPage();
        await addWebhook();

        const secret = screen.getByLabelText(/^Secret/);
        expect(secret).toHaveAttribute('type', 'password');
        expect(secret).toHaveAttribute('autocomplete', 'new-password');
        expect(screen.getByText('(optional)')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Url/)).toHaveAttribute('type', 'text');
    });

    it('masks a parameter by a word the API publishes and the console copy lacks', async () => {
        // An action whose example names a Signature. "signature" is not in the fallback list, so
        // only the words from GET /api/meta/describe can mask it.
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, ...rest: unknown[]) => {
            if (url === '/api/meta/describe') return { data: { credentialNameParts: ['secret', 'signature'] } };
            if (url === '/api/workflows/actions') {
                return {
                    data: [
                        {
                            ...ACTIONS[0],
                            exampleConfiguration:
                                '{"Type":"Webhook","Parameters":{"Url":"https://example.com/webhook","Signature":"optional"}}',
                        },
                    ],
                };
            }
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        }) as typeof api.get);

        renderPage();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/meta/describe'));
        await addWebhook();

        await waitFor(() => expect(screen.getByLabelText(/^Signature/)).toHaveAttribute('type', 'password'));
        expect(screen.getByLabelText(/^Url/)).toHaveAttribute('type', 'text');
    });

    it('keeps masking by the console copy when the API publishes no words', async () => {
        renderPage();
        await addWebhook();

        expect(screen.getByLabelText(/^Secret/)).toHaveAttribute('type', 'password');
    });

    it('sends a Published trigger and the typed Secret when the workflow is created', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Invalidate the site cache' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        await choose('…is', 'Published');
        const url = await addWebhook();
        fireEvent.change(url, { target: { value: 'https://site.example/api/revalidate' } });
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: 'shared-s3cret' } });

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([
            '/api/workflows',
            {
                name: 'Invalidate the site cache',
                triggerContentType: 'post',
                triggerEvent: 'Published',
                conditions: {},
                actions: [
                    {
                        type: 'Webhook',
                        parameters: { Url: 'https://site.example/api/revalidate', Secret: 'shared-s3cret' },
                    },
                ],
            },
        ]);
    });

    it('does not send an empty Secret when one was typed and then cleared', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsigned hook' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        const url = await addWebhook();
        fireEvent.change(url, { target: { value: 'https://site.example/hook' } });
        // Typed and cleared, so the form state holds Secret: '' rather than no Secret at all.
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: 'oops' } });
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: '' } });

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as { actions: { parameters: Record<string, string> }[] };
        expect(body.actions).toHaveLength(1);
        expect(body.actions[0].parameters).toEqual({ Url: 'https://site.example/hook' });
    });
});

describe('stopping the run when an action fails', () => {
    it('sends onFailure Halt for an action set to stop the run, and nothing for one that is not', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Post then file' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        fireEvent.change(await addWebhook(), { target: { value: 'https://a.example/hook' } });
        await choose('Add an action', 'Webhook');
        const urls = screen.getAllByLabelText(/^Url/);
        expect(urls).toHaveLength(2);
        fireEvent.change(urls[1], { target: { value: 'https://b.example/hook' } });

        const halts = screen.getAllByLabelText('Stop the actions after this one if it fails');
        expect(halts).toHaveLength(2);
        fireEvent.click(halts[0]);

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as { actions: Record<string, unknown>[] };
        expect(body.actions).toHaveLength(2);
        expect(body.actions[0].onFailure).toBe('Halt');
        expect('onFailure' in body.actions[1]).toBe(false);
    });
});

describe('the placeholder help', () => {
    it('lists the names and the formats the API reports', async () => {
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, ...rest: unknown[]) =>
            url === '/api/workflows/variables'
                ? {
                      data: {
                          systemVariables: [
                              { name: '{{createdBy.email}}', description: 'The author', example: 'a@example.com', type: 'string' },
                              { name: '{{transition.at}}', description: 'When', example: '', type: 'datetime' },
                          ],
                          dataFields: [],
                          formats: [
                              {
                                  name: '{{createdAt | date "MMM d, h:mm tt"}}',
                                  description: "A date in the site's time zone",
                                  example: 'Dec 16, 6:00 PM',
                                  type: 'string',
                              },
                              { name: '{{duration createdAt updatedAt}}', description: 'The time between two dates', example: '8 hours 30 minutes', type: 'string' },
                          ],
                      },
                  }
                : (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest)) as typeof api.get);

        renderPage();

        expect(await screen.findByText('{{createdBy.email}}')).toBeInTheDocument();
        expect(screen.getByText('{{transition.at}}')).toBeInTheDocument();
        const formats = screen.getByLabelText('Formats and durations');
        expect(within(formats).getAllByRole('term', { hidden: true })).toHaveLength(2);
        expect(screen.getByText('{{createdAt | date "MMM d, h:mm tt"}}')).toBeInTheDocument();
        expect(screen.getByText(/For example: 8 hours 30 minutes/)).toBeInTheDocument();
    });
});

describe('the builder timeline', () => {
    it('lays the form out as When, Only when and Then do, in that order', async () => {
        renderPage();
        await screen.findByRole('heading', { name: 'Action library' });

        const steps = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
        expect(steps).toEqual(['When', 'Only when', 'Then do', 'Action library']);
    });

    it('adds an action from the library beside the builder', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Add Webhook' }));

        expect(await screen.findByLabelText(/^Url/)).toBeInTheDocument();
    });
});

describe('the Request action', () => {
    // As GET /api/workflows/actions returns RequestAction on barakoCMS 5.0.
    const REQUEST_META: WorkflowActionMetadata = {
        type: 'Request',
        description: 'Send a configured request through a configured connector',
        requiredParameters: ['Request'],
        exampleConfiguration: '{"Type":"Request","Parameters":{"Request":"post-to-facebook"}}',
        group: 'Delivery',
    };

    // Two definitions as GET /api/requests returns them, so choosing the second cannot pass by default.
    const REQUESTS = [
        {
            id: 'r1', name: 'Ping Slack', slug: 'ping-slack', connectorSlug: 'slack', method: 'POST',
            pathTemplate: '/hooks/abc', headerTemplates: {}, bodyTemplate: '{"text":"{{data.Title}}"}',
            bodyContentType: 'application/json', querySlug: null, success: 'TwoHundredRange', successJsonPath: null,
            createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
        },
        {
            id: 'r2', name: 'Post to Facebook', slug: 'post-to-facebook', connectorSlug: 'facebook', method: 'PUT',
            pathTemplate: '/v19.0/{{data.PageId}}/feed', headerTemplates: { 'X-Trace': '{{id}}' }, bodyTemplate: null,
            bodyContentType: 'application/json', querySlug: null, success: 'TwoHundredRange', successJsonPath: null,
            createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
        },
    ];

    function serve(requests: () => unknown) {
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, ...rest: unknown[]) => {
            if (url === '/api/workflows/actions') return { data: [REQUEST_META] };
            if (url === '/api/requests') return requests();
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        }) as typeof api.get);
    }

    it('picks a configured request, shows what it sends, and saves its slug', async () => {
        serve(() => ({ data: page(REQUESTS) }));
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Share on publish' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
        await choose('Add an action', 'Request');
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/requests'));
        await choose('Request', 'Post to Facebook (post-to-facebook)');

        const sends = screen.getByLabelText('What this request sends');
        expect(within(sends).getAllByRole('definition', { hidden: true }).map((d) => d.textContent)).toEqual([
            'PUT',
            'facebook',
            '/v19.0/{{data.PageId}}/feed',
            'X-Trace',
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as { actions: unknown[] };
        expect(body.actions).toEqual([{ type: 'Request', parameters: { Request: 'post-to-facebook' } }]);
    });

    it('takes a typed slug when the requests cannot be listed', async () => {
        serve(() => Promise.reject(Object.assign(new Error('Forbidden'), { response: { status: 403 } })));
        renderPage();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
        await choose('Add an action', 'Request');

        const input = await screen.findByRole('textbox', { name: 'Request' });
        fireEvent.change(input, { target: { value: 'ping-slack' } });

        expect(input).toHaveValue('ping-slack');
        expect(screen.getByText(/could not be listed/)).toBeInTheDocument();
    });
});

describe('the Email action template', () => {
    // As GET /api/workflows/actions returns EmailAction on barakoCMS 5.0, Template among its optional parameters.
    const EMAIL_META: WorkflowActionMetadata = {
        type: 'Email',
        description: 'Send email notifications',
        requiredParameters: ['To', 'Subject', 'Body'],
        optionalParameters: ['Attachments', 'Template'],
        exampleConfiguration:
            '{"Type":"Email","Parameters":{"To":"admin@example.com","Subject":"Workflow Triggered","Body":"Content {{id}} was updated"}}',
        group: 'Comms',
    };

    const TEMPLATES = [
        { id: 't1', contentType: 'email-template', status: 'Published', data: { Name: 'Receipt', Slug: 'receipt' } },
        { id: 't2', contentType: 'email-template', status: 'Published', data: { Name: 'Welcome', Slug: 'welcome' } },
    ];

    function serve(meta: WorkflowActionMetadata) {
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation((async (url: string, ...rest: unknown[]) => {
            if (url === '/api/workflows/actions') return { data: [meta] };
            if (url === '/api/contents') return { data: page(TEMPLATES) };
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        }) as typeof api.get);
    }

    async function addEmail() {
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
        await choose('Add an action', 'Email');
        return screen.findByLabelText(/^To/);
    }

    it('sends the chosen template by slug, with no Subject or Body beside it', async () => {
        serve(EMAIL_META);
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Welcome a booker' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        fireEvent.change(await addEmail(), { target: { value: '{{createdBy.email}}' } });
        fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: 'Typed before the template' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/contents', expect.anything()));
        await choose('Template (optional)', 'Welcome');

        expect(screen.queryByLabelText(/^Subject/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/^Body/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as { actions: unknown[] };
        expect(body.actions).toEqual([
            { type: 'Email', parameters: { To: '{{createdBy.email}}', Template: 'welcome' } },
        ]);
    });

    it('saves an inline subject and body as a draft template', async () => {
        serve(EMAIL_META);
        renderPage();
        await addEmail();
        fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: 'Booked' } });
        fireEvent.change(screen.getByLabelText(/^Body/), { target: { value: 'See you {{data.Date}}' } });

        fireEvent.click(screen.getByRole('button', { name: 'save this subject and body as a template' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Booked' } });
        fireEvent.change(within(dialog).getByLabelText('Slug'), { target: { value: 'booked' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([
            '/api/contents',
            {
                contentType: 'email-template',
                status: 'Draft',
                data: { Name: 'Booked', Slug: 'booked', Subject: 'Booked', Body: 'See you {{data.Date}}' },
            },
        ]);
    });

    it('brings back the typed subject and body when the template is set back to none', async () => {
        serve(EMAIL_META);
        renderPage();
        await addEmail();
        fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: 'Booked' } });
        fireEvent.change(screen.getByLabelText(/^Body/), { target: { value: 'See you {{data.Date}}' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/contents', expect.anything()));

        await choose('Template (optional)', 'Welcome');
        expect(screen.queryByLabelText(/^Subject/)).not.toBeInTheDocument();
        await choose('Template (optional)', 'None, write the subject and body here');

        expect(screen.getByLabelText(/^Subject/)).toHaveValue('Booked');
        expect(screen.getByLabelText(/^Body/)).toHaveValue('See you {{data.Date}}');
    });

    it('offers no template picker to an API whose Email action takes no Template', async () => {
        serve({ ...EMAIL_META, optionalParameters: undefined });
        renderPage();
        await addEmail();

        expect(screen.getByLabelText(/^Subject/)).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Template (optional)' })).not.toBeInTheDocument();
    });
});
