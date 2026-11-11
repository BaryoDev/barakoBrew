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
  extra: { lastModifiedBy?: string; updatedAt?: string; contentType?: string } = {}
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
    ...(extra.lastModifiedBy ? { lastModifiedBy: extra.lastModifiedBy } : {}),
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
    row('a', 'Alpha', ContentStatus.Published, { lastModifiedBy: 'Ana' }),
    row('b', 'Beta', ContentStatus.Draft, { lastModifiedBy: 'Marco' }),
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
  it('are toggle buttons whose names carry the counts of the rows on this page', async () => {
    renderList();
    await screen.findByText('Alpha');

    const group = screen.getByRole('group', { name: 'Filter by status' });
    const all = within(group).getByRole('button', { name: 'All, 3 on this page' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Draft, 2 on this page' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Published, 1 on this page' })).toBeTruthy();
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
      within(screen.getByRole('group', { name: 'Filter by status' })).getByText('on this page')
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
    const draft = await screen.findByRole('button', { name: 'Draft, 2 on this page' });
    expect(draft.getAttribute('aria-pressed')).toBe('true');
    // Published would read zero, which is a claim about entries the filter hid.
    expect(screen.getByRole('button', { name: 'Published' })).toBeTruthy();
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

describe('the search and the Author column', () => {
  it('is worded for title and author, and sends what is typed to the server', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    const box = screen.getByRole('searchbox', { name: /search entries/i });
    expect(box.getAttribute('placeholder')).toBe('Filter by title or author');

    await user.type(box, 'marco');
    await waitFor(() => expect(lastListParams().search).toBe('marco'));
  });

  it('shows who last changed each entry, and a blank where the server did not say', async () => {
    renderList();
    await screen.findByText('Alpha');

    expect(screen.getByRole('columnheader', { name: 'Author' })).toBeTruthy();
    const cells = bodyRows();
    expect(cells).toHaveLength(3);
    expect(within(cells[0]).getByText('Ana')).toBeTruthy();
    expect(within(cells[1]).getByText('Marco')).toBeTruthy();
    expect(within(cells[2]).queryByText(/Ana|Marco/)).toBeNull();
  });
});

describe('selecting rows', () => {
  it('labels each row checkbox with the entry title', async () => {
    renderList();
    await screen.findByText('Alpha');

    expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select Beta' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select Gamma' })).toBeTruthy();
  });

  it('selects every row on the page from the header, and clears them again', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('checkbox', { name: 'Select all entries on this page' }));

    const boxes = bodyRows().map((r) => within(r).getByRole('checkbox'));
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(screen.getByText('3 selected')).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: 'Select all entries on this page' }));
    expect(boxes.every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('marks the header as mixed when only some rows are selected', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('checkbox', { name: 'Select Beta' }));

    const header = screen.getByRole('checkbox', { name: 'Select all entries on this page' });
    expect(header.getAttribute('aria-checked')).toBe('mixed');
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('does not open the entry when a checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));

    expect(push).not.toHaveBeenCalled();
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
