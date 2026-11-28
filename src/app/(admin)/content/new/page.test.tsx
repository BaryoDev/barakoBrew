import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ContentTypeDefinition, FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('type=order'),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { userId: 'u1', id: 'u1', username: 'a', roles: ['Admin'] } }),
}));

vi.mock('@/hooks/use-access', () => ({ useAccess: () => ({ viewer: { roles: ['Admin'] } }) }));

// Radix Select needs these to open in jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { api } = await import('@/lib/api');
const { default: NewContentPage } = await import('./page');

function field(name: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
  return { name, displayName: name, type, isRequired: false, ...extra } as FieldDefinition;
}

const ORDER = {
  name: 'order',
  displayName: 'Order',
  fields: [field('Reference', 'string')],
  lines: { contentType: 'orderline', parentField: 'Order' },
} as ContentTypeDefinition;

const LINE = {
  name: 'orderline',
  displayName: 'Order lines',
  fields: [field('Order', 'reference', { referenceType: 'order' }), field('Item', 'string')],
} as ContentTypeDefinition;

const NOTE = { name: 'note', displayName: 'Note', fields: [field('Body', 'string')] } as ContentTypeDefinition;

function pageOf(items: ContentTypeDefinition[], hasNextPage = false) {
  return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage, hasPreviousPage: false };
}

const pageAsked = (config?: { params?: unknown }) => (config?.params as { page?: number } | undefined)?.page ?? 1;

/**
 * The types as the API pages them: the list the console reads first, and the pages the lookup
 * reads by name. `pages` is what each page holds, in order.
 */
function serve(pages: ContentTypeDefinition[][]) {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: { params?: unknown }) => {
    if (url !== '/api/content-types') throw new Error(`unrouted GET ${url}`);
    const page = pageAsked(config);
    return { data: pageOf(pages[page - 1] ?? [], page < pages.length) };
  });
}

function refused(errors: string[]) {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
  error.response = {
    data: { status: 422, errors },
    status: 422,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewContentPage />
    </QueryClientProvider>,
  );
}

async function addLine(item: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Add line' }));
  fireEvent.change(await screen.findByLabelText('Item, line 1'), { target: { value: item } });
}

function chooseType(name: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Content type' }), { key: 'ArrowDown' });
  const option = within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .find((o) => o.textContent === name);
  if (!option) throw new Error(`no type ${name}`);
  fireEvent.keyDown(option, { key: 'Enter' });
}

describe('the new entry page, for a type with lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the lines with the entry', async () => {
    serve([[ORDER, LINE, NOTE]]);
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'o-1', version: 1 } });
    renderPage();

    await addLine('Bolt');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({
      contentType: 'order',
      lines: [{ Item: 'Bolt' }],
    });
  });

  it('shows a refusal about a line at the grid and the rest under the buttons', async () => {
    serve([[ORDER, LINE, NOTE]]);
    vi.mocked(api.post).mockRejectedValue(refused(['Line 1: Item is required', 'Reference is already used']));
    renderPage();

    await addLine('Bolt');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.textContent)).toEqual(
      expect.arrayContaining(['Line 1: Item is required', 'Reference is already used']),
    );
    // The line refusal sits in the grid, under its line, and not in the one under the buttons.
    expect(within(screen.getByRole('table')).getByText('Line 1: Item is required')).toBeInTheDocument();
    expect(screen.getByText('Reference is already used').closest('table')).toBeNull();
  });

  it('shows nothing under the buttons when the grid took every refusal', async () => {
    serve([[ORDER, LINE, NOTE]]);
    vi.mocked(api.post).mockRejectedValue(refused(['Line 1: Item is required']));
    renderPage();

    await addLine('Bolt');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Line 1: Item is required')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText('The entry could not be saved.')).toBeNull();
    // The buttons are usable again, and nothing was navigated away from.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
  });

  it('drops the rows and their refusals when another type is picked', async () => {
    serve([[ORDER, LINE, NOTE]]);
    vi.mocked(api.post).mockRejectedValue(refused(['Line 1: Item is required']));
    renderPage();

    await addLine('Bolt');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Line 1: Item is required');

    chooseType('Note');
    expect(screen.queryByRole('button', { name: 'Add line' })).toBeNull();
    expect(screen.queryByText('Line 1: Item is required')).toBeNull();

    chooseType('Order');
    expect(await screen.findByText('No lines yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Item, line 1')).toBeNull();
    expect(screen.queryByText('Line 1: Item is required')).toBeNull();
  });

  it('reads the line type by name when it is not on the first page of types', async () => {
    serve([[ORDER, NOTE], [LINE]]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Add line' })).toBeInTheDocument();
    expect(screen.queryByText(/is not in the type list/)).toBeNull();
    expect(
      vi.mocked(api.get).mock.calls.some(([, config]) => pageAsked(config) === 2),
    ).toBe(true);
  });

  it('says so, naming the type, when the line type is in no page', async () => {
    serve([[ORDER, NOTE]]);
    renderPage();

    expect(
      await screen.findByText('The line type orderline is not in the type list, so lines cannot be entered here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add line' })).toBeNull();
    // The entry itself can still be saved, without lines.
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });
});
