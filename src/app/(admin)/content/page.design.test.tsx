import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus, SensitivityLevel } from '@/types/content';

/**
 * The Entries list as the round 3 design draws it (#287): type tabs, status chips with counts,
 * a checkbox column, an Author column and relative times.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

let searchParams = new URLSearchParams();
const paramListeners = new Set<() => void>();
const replace = vi.fn();
const push = vi.fn();
const navigate = (url: string) => {
  searchParams = new URLSearchParams(url.split('?')[1] ?? '');
  paramListeners.forEach((notify) => notify());
};

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRouter: () => ({ push, replace, back: vi.fn(), refresh: vi.fn() }),
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

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: ContentListPage } = await import('./page');

const SCHEMAS = [
  {
    name: 'article',
    displayName: 'Articles',
    isSingleton: false,
    isPubliclyDeliverable: true,
    fields: [],
  },
  {
    name: 'page',
    displayName: 'Pages',
    isSingleton: false,
    isPubliclyDeliverable: true,
    fields: [],
  },
  { name: 'settings', displayName: 'Site settings', isSingleton: true, fields: [] },
];

function row(
  id: string,
  title: string,
  status: string,
  extra: { updatedAt?: string; contentType?: string } = {}
) {
  return {
    id,
    contentType: extra.contentType ?? 'article',
    data: { Title: title },
    status,
    sensitivity: SensitivityLevel.Public,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: extra.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

let rows: ReturnType<typeof row>[];

function lastListParams() {
  const calls = vi.mocked(api.get).mock.calls.filter((call) => call[0] === '/api/contents');
  expect(calls.length, 'the entries list was never requested').toBeGreaterThan(0);
  return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params;
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockImplementation(navigate);
  searchParams = new URLSearchParams();
  rows = [
    row('a', 'Alpha', ContentStatus.Published),
    row('b', 'Beta', ContentStatus.Draft),
    row('c', 'Gamma', ContentStatus.Draft),
  ];
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/content-types') {
      return { data: { items: SCHEMAS, page: 1, pageSize: 20, totalItems: SCHEMAS.length } };
    }
    if (url === '/api/contents') {
      return {
        data: {
          items: rows,
          page: 1,
          pageSize: 20,
          // Deliberately not rows.length: the server's total is not a per-status count.
          totalItems: 148,
          totalPages: 8,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
});

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContentListPage />
    </QueryClientProvider>
  );
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('the content type tabs', () => {
  it('are a tablist with All first, then each list type, and no tab for a single-entry type', async () => {
    renderList();
    await screen.findByText('Alpha');

    const tablist = screen.getByRole('tablist', { name: 'Content type' });
    const names = within(tablist)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(names).toEqual(['All', 'Articles', 'Pages']);
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ask the server for the chosen type and go back to the first page', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    expect(lastListParams().contentType).toBeUndefined();

    await user.click(await screen.findByRole('tab', { name: 'Pages' }));

    await waitFor(() => expect(lastListParams().contentType).toBe('page'));
    expect(lastListParams().page).toBe(1);
    expect(screen.getByRole('tab', { name: 'Pages' }).getAttribute('aria-selected')).toBe('true');
  });

  it('replace the type select', async () => {
    renderList();
    await screen.findByText('Alpha');
    expect(screen.queryByRole('combobox', { name: /content type/i })).toBeNull();
  });
});

describe('the status chips', () => {
  it('are toggle buttons whose names carry the counts of the rows on this page, in the visible text', async () => {
    renderList();
    await screen.findByText('Alpha');

    const group = screen.getByRole('group', { name: 'Filter by status' });
    const all = within(group).getByRole('button', { name: 'All 3' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Draft 2' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Published 1' })).toBeTruthy();
    // No row is Archived or Scheduled, so those are tallied as none, not left unsaid.
    expect(within(group).getByRole('button', { name: 'Archived' })).toBeTruthy();
  });

  it('never use the server total as a status count, and say the counts are for the page', async () => {
    renderList();
    await screen.findByText('Alpha');

    // totalItems is 148 in the fixture. A chip reading 148 would be the whole collection counted
    // as one status.
    expect(screen.queryByRole('button', { name: /148/ })).toBeNull();
    expect(
      within(screen.getByRole('group', { name: 'Filter by status' })).getByText(
        'Counts on this page'
      )
    ).toBeTruthy();
  });

  it('show no In review chip, because the API sends no such status', async () => {
    renderList();
    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: /^In review/ })).toBeNull();
  });

  it('count only the chosen status once the server has narrowed the list', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    rows = [row('b', 'Beta', ContentStatus.Draft), row('c', 'Gamma', ContentStatus.Draft)];

    await user.click(screen.getByRole('button', { name: /^Draft/ }));

    await waitFor(() => expect(lastListParams().status).toBe(ContentStatus.Draft));
    const draft = await screen.findByRole('button', { name: 'Draft 2' });
    expect(draft.getAttribute('aria-pressed')).toBe('true');
    // Published would read zero, which is a claim about entries the filter hid.
    expect(screen.getByRole('button', { name: 'Published' })).toBeTruthy();
  });

  it('show a count on the chosen chip only, and say the list is showing that status only', async () => {
    searchParams = new URLSearchParams('status=Draft');
    rows = [row('b', 'Beta', ContentStatus.Draft), row('c', 'Gamma', ContentStatus.Draft)];
    renderList();
    await screen.findByText('Beta');

    const group = screen.getByRole('group', { name: 'Filter by status' });
    const counted = within(group)
      .getAllByRole('button')
      .filter((button) => /\d/.test(button.textContent ?? ''));
    expect(counted.map((button) => button.textContent)).toEqual(['Draft 2']);
    expect(within(group).getByText('Showing Draft only')).toBeTruthy();
    expect(within(group).queryByText('Counts on this page')).toBeNull();
  });

  it('go back to All when the pressed chip is pressed again', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: /^Draft/ }));
    await waitFor(() => expect(lastListParams().status).toBe(ContentStatus.Draft));
    await user.click(await screen.findByRole('button', { name: /^Draft/ }));

    await waitFor(() => expect(lastListParams().status).toBeUndefined());
  });
});

describe('filters go back to the first page', () => {
  it('a status chip clicked from page 3 writes a URL with no page', async () => {
    searchParams = new URLSearchParams('page=3');
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: /^Draft/ }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const url = replace.mock.calls[replace.mock.calls.length - 1][0] as string;
    expect(url).toContain('status=Draft');
    expect(url).not.toContain('page=');
  });

  it('a type tab clicked from page 3 writes a URL with no page', async () => {
    searchParams = new URLSearchParams('page=3');
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(await screen.findByRole('tab', { name: 'Pages' }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const url = replace.mock.calls[replace.mock.calls.length - 1][0] as string;
    expect(url).toContain('type=page');
    expect(url).not.toContain('page=3');
    expect(new URL(url, 'http://x').searchParams.has('page')).toBe(false);
  });
});

describe('the search', () => {
  it('is worded for title only, which is all the server matches, and sends what is typed to the server', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    const box = screen.getByRole('searchbox', { name: /search entries/i });
    expect(box.getAttribute('placeholder')).toBe('Filter by title');

    await user.type(box, 'beta');
    await waitFor(() => expect(lastListParams().search).toBe('beta'));
  });
});

describe('relative times', () => {
  it('shows a relative time with the exact one in the title', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    rows = [row('a', 'Alpha', ContentStatus.Published, { updatedAt: twoHoursAgo })];

    renderList();
    await screen.findByText('Alpha');

    const time = within(bodyRows()[0]).getByText('2h ago');
    expect(time.getAttribute('title')).toBe(new Date(twoHoursAgo).toLocaleString());
    expect(time.getAttribute('datetime')).toBe(twoHoursAgo);
  });
});
