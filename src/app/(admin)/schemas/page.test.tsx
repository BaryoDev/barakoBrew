import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SensitivityLevel } from '@/types/schema';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * The selection lives in the query string, so the router mock has to write to it and the mocked
 * `useSearchParams` has to read it back, or a click would never reach the screen.
 */
let searchParams = new URLSearchParams();
const paramListeners = new Set<() => void>();

const replace = vi.fn((url: string) => {
  searchParams = new URLSearchParams(url.split('?')[1] ?? '');
  paramListeners.forEach((notify) => notify());
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () =>
      useSyncExternalStore(
        (onChange: () => void) => {
          paramListeners.add(onChange);
          return () => paramListeners.delete(onChange);
        },
        () => searchParams,
        () => searchParams
      ),
  };
});

const { api } = await import('@/lib/api');
const { default: SchemasPage } = await import('./page');

const TYPES = [
  {
    name: 'article',
    displayName: 'Articles',
    fields: [
      { name: 'title', displayName: 'Title', type: 'string', isRequired: true },
      { name: 'body', displayName: 'Body', type: 'richtext', isRequired: false },
    ],
  },
  {
    name: 'staff',
    displayName: 'Staff',
    fields: [
      { name: 'fullName', displayName: 'Full name', type: 'string', isRequired: true },
      {
        name: 'phone',
        displayName: 'Phone',
        type: 'string',
        isRequired: false,
        sensitivity: SensitivityLevel.Sensitive,
      },
      { name: 'bio', displayName: 'Bio', type: 'text', isRequired: false },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  searchParams = new URLSearchParams();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/content-types') {
      return { data: { items: TYPES, page: 1, pageSize: 20, totalItems: TYPES.length } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
});

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <QueryClientProvider client={client}>
        <SchemasPage />
      </QueryClientProvider>
    );
  });
  return view;
}

describe('the content types screen', () => {
  it('lists each type with its slug and field count', async () => {
    await renderPage();
    const list = await screen.findByRole('list', { name: 'Content types' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('staff')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('3 fields')).toBeInTheDocument();
  });

  it('shows the first type selected and tinted when the URL names none', async () => {
    await renderPage();
    const rows = within(await screen.findByRole('list', { name: 'Content types' })).getAllByRole('button');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(rows[0].className).toContain('bg-primary/10');
    expect(rows[1]).not.toHaveAttribute('aria-current');
    expect(rows[1].className).not.toContain('bg-primary/10');
    expect(await screen.findByRole('heading', { name: 'Articles' })).toBeInTheDocument();
  });

  it('selecting a type shows its fields with Required and sensitivity', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /Staff/ }));

    const detail = await screen.findByRole('region', { name: 'Staff fields' });
    const rows = within(detail).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('fullName')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Required')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Optional')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: /phone sensitivity: Sensitive/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Add a field' })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/schemas?type=staff', { scroll: false });
  });

  it('keeps the selection when the page is reloaded', async () => {
    const user = userEvent.setup();
    const first = await renderPage();
    await user.click(await screen.findByRole('button', { name: /Staff/ }));
    await screen.findByRole('region', { name: 'Staff fields' });
    first.unmount();

    // A reload is a new mount reading the same URL.
    await renderPage();
    const detail = await screen.findByRole('region', { name: 'Staff fields' });
    await waitFor(() => expect(within(detail).getAllByRole('row').length).toBeGreaterThan(1));
    expect(screen.queryByRole('region', { name: 'Articles fields' })).not.toBeInTheDocument();
  });

  it('does not carry an open Add a field draft to the next type', async () => {
    const user = userEvent.setup();
    await renderPage();
    const detail = await screen.findByRole('region', { name: 'Articles fields' });
    await user.click(within(detail).getByRole('button', { name: 'Add a field' }));
    await user.click(within(detail).getByRole('button', { name: 'Text' }));
    await user.type(within(detail).getByLabelText('Label'), 'Teaser');

    await user.click(screen.getByRole('button', { name: /Staff/ }));
    const next = await screen.findByRole('region', { name: 'Staff fields' });
    expect(within(next).queryByRole('region', { name: 'Add a field' })).not.toBeInTheDocument();
    await user.click(within(next).getByRole('button', { name: 'Add a field' }));
    await user.click(within(next).getByRole('button', { name: 'Text' }));
    expect(within(next).getByLabelText('Label')).toHaveValue('');
  });

  it('keeps the detail on the first type, not the search result, when the URL names none', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(await screen.findByLabelText('Search content types'), 'staff');
    expect(screen.getByRole('region', { name: 'Articles fields' })).toBeInTheDocument();
  });

  it('falls back to the first type when the URL names one that is gone', async () => {
    searchParams = new URLSearchParams('type=deleted');
    await renderPage();
    expect(await screen.findByRole('region', { name: 'Articles fields' })).toBeInTheDocument();
  });
});
