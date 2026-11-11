import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
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

const toastFn = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() })
);
vi.mock('sonner', () => ({ toast: toastFn }));

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
    // A circle, which none of the built-in glyphs draw, so it can only come from this icon.
    icon: {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="8"/></svg>',
    },
    isSingleton: false,
    isPubliclyDeliverable: true,
    fields: [],
  },
  {
    name: 'page',
    displayName: 'Pages',
    lifecycle: {
      states: ['Draft', 'Live'],
      initialState: 'Draft',
      transitions: [{ name: 'go-live', from: 'Draft', to: 'Live' }],
    },
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
// Deliberately unlike the rows on the page: the counts are the type's, not the page's.
let counts: {
  total: number;
  draft: number;
  published: number;
  archived: number;
  scheduled: number;
  uncountedTypes?: string[];
};
// What the entries are in right now, for the read an undo makes before it moves anything.
let statusNow: Record<string, string>;

function lastListParams() {
  const calls = vi.mocked(api.get).mock.calls.filter((call) => call[0] === '/api/contents');
  expect(calls.length, 'the entries list was never requested').toBeGreaterThan(0);
  return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params;
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockImplementation(navigate);
  searchParams = new URLSearchParams();
  statusNow = {};
  counts = { total: 148, draft: 60, published: 70, archived: 11, scheduled: 7 };
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
    if (url === '/api/contents/counts') {
      return { data: counts };
    }
    const detail = /^\/api\/contents\/([^/]+)$/.exec(url);
    if (detail) return { data: { ...rows.find((r) => r.id === detail[1]), status: statusNow[detail[1]] } };
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

describe('the type icon', () => {
  it('is drawn on the tab of a type that has one and not on a type without', async () => {
    renderList();
    await screen.findByText('Alpha');

    expect(screen.getByRole('tab', { name: 'Articles' }).querySelector('circle')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Pages' }).querySelector('circle')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Pages' }).querySelector('svg')).not.toBeNull();
  });

  it('is drawn in the type column of a row', async () => {
    renderList();
    await screen.findByText('Alpha');

    const cells = within(bodyRows()[0]).getAllByRole('cell');
    expect(cells.some((cell) => cell.textContent === 'article' && cell.querySelector('circle'))).toBe(true);
  });
});

describe('the status chips', () => {
  it('carry the counts GET /api/contents/counts gave, in the visible text', async () => {
    renderList();
    await screen.findByText('Alpha');

    const group = screen.getByRole('group', { name: 'Filter by status' });
    const all = await within(group).findByRole('button', { name: 'All 148' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Draft 60' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Scheduled 7' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Published 70' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Archived 11' })).toBeTruthy();
  });

  it('are not a tally of the rows on the page, and no longer say they are', async () => {
    renderList();
    await screen.findByText('Alpha');

    // Three rows are loaded. A chip reading 3 or 2 would be this page counted.
    await screen.findByRole('button', { name: 'Draft 60' });
    expect(screen.queryByRole('button', { name: 'Draft 2' })).toBeNull();
    expect(screen.queryByText('Counts on this page')).toBeNull();
    expect(screen.queryByText(/showing .* only/i)).toBeNull();
  });

  it('ask for the counts of the chosen type', async () => {
    searchParams = new URLSearchParams('type=page');
    renderList();
    await screen.findByText('Alpha');

    await screen.findByRole('button', { name: 'All 148' });
    const call = vi.mocked(api.get).mock.calls.find((c) => c[0] === '/api/contents/counts')!;
    expect((call[1] as { params: { contentType: string } }).params.contentType).toBe('page');
  });

  it('show no number until the counts arrive, and none if they cannot be had', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/content-types') return { data: { items: SCHEMAS, page: 1, pageSize: 20, totalItems: 3 } };
      if (url === '/api/contents') return { data: { items: rows, page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } };
      throw new Error('counts unavailable');
    });
    renderList();
    await screen.findByText('Alpha');

    expect(screen.getByRole('button', { name: 'Draft' })).toBeTruthy();
  });

  it('show no In review chip, because the API sends no such status', async () => {
    renderList();
    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: /^In review/ })).toBeNull();
  });

  it('keep every count when a status is chosen, so chips can still be compared', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    rows = [row('b', 'Beta', ContentStatus.Draft), row('c', 'Gamma', ContentStatus.Draft)];

    await user.click(await screen.findByRole('button', { name: /^Draft/ }));

    await waitFor(() => expect(lastListParams().status).toBe(ContentStatus.Draft));
    const draft = await screen.findByRole('button', { name: 'Draft 60' });
    expect(draft.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Published 70' })).toBeTruthy();
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

describe('the selection column and bulk bar', () => {
  const tick = (user: ReturnType<typeof userEvent.setup>, title: string) =>
    user.click(screen.getByRole('checkbox', { name: `Select ${title}` }));

  beforeEach(() => {
    vi.mocked(api.put).mockResolvedValue({ data: { message: 'ok' } });
  });

  it('has a checkbox per row and one for the page, and no bar until something is ticked', async () => {
    renderList();
    await screen.findByText('Alpha');

    expect(screen.getByRole('checkbox', { name: 'Select all entries on this page' })).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });

  it('shows how many are selected, and Clear empties it', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Beta');
    await tick(user, 'Gamma');
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByText('2 selected')).toBeTruthy();

    await user.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });

  it('selects every row on the page from the header checkbox', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('checkbox', { name: 'Select all entries on this page' }));

    expect(within(screen.getByRole('region', { name: 'Bulk actions' })).getByText('3 selected')).toBeTruthy();
  });

  it('publishes each ticked draft with the per-entry status route, leaving ones already published alone', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');
    await tick(user, 'Beta');
    await tick(user, 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.put).mock.calls.map((c) => c[0]).sort()).toEqual([
      '/api/contents/b/status',
      '/api/contents/c/status',
    ]);
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ newStatus: ContentStatus.Published });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull());
  });

  it('archives, and the undo toast puts every entry back in the status it had', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');
    await tick(user, 'Beta');
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    expect(toastFn.mock.calls[0][0]).toBe('2 entries archived');
    statusNow = { a: ContentStatus.Archived, b: ContentStatus.Archived };
    const action = (toastFn.mock.calls[0][1] as { action: { label: string; onClick: () => void } }).action;
    expect(action.label).toBe('Undo');
    vi.mocked(api.put).mockClear();

    action.onClick();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    const sent = Object.fromEntries(
      vi.mocked(api.put).mock.calls.map((c) => [c[0], (c[1] as { newStatus: string }).newStatus])
    );
    expect(sent).toEqual({
      '/api/contents/a/status': ContentStatus.Published,
      '/api/contents/b/status': ContentStatus.Draft,
    });
  });

  it('says how many were refused and still offers undo for the rest', async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockImplementation(async (url: string) => {
      if (url === '/api/contents/c/status') throw new Error('This type has its own lifecycle.');
      return { data: { message: 'ok' } };
    });
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Beta');
    await tick(user, 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(toastFn.error.mock.calls[0][0]).toMatch(/^1 of 2 could not be changed/);
    expect(toastFn.mock.calls[0][0]).toBe('1 entry published');
  });

  it('drops the selection when a filter changes', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    await tick(user, 'Beta');
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Draft/ }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull());
  });

  it('does not open the entry when a checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');

    expect(push).not.toHaveBeenCalled();
  });

  it('leaves a Scheduled entry out of a bulk change and says so, because undo cannot restore its time', async () => {
    const user = userEvent.setup();
    rows = [row('a', 'Alpha', ContentStatus.Scheduled), row('b', 'Beta', ContentStatus.Draft)];
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');
    await tick(user, 'Beta');
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByText('1 scheduled left out')).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/contents/b/status');
  });

  it('disables the actions when everything ticked is Scheduled', async () => {
    const user = userEvent.setup();
    rows = [row('a', 'Alpha', ContentStatus.Scheduled)];
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');

    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Archive' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves out an entry whose type has its own lifecycle, and says why', async () => {
    const user = userEvent.setup();
    rows = [
      row('a', 'Alpha', ContentStatus.Draft, { contentType: 'page' }),
      row('b', 'Beta', ContentStatus.Draft),
    ];
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Alpha');
    await tick(user, 'Beta');
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByText(/1 left out, their type has its own lifecycle/)).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/contents/b/status');
  });

  it('works once: a second press of Undo sends nothing more', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    await tick(user, 'Beta');
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    statusNow = { b: ContentStatus.Archived };
    const action = (toastFn.mock.calls[0][1] as { action: { onClick: () => void } }).action;
    vi.mocked(api.put).mockClear();

    action.onClick();
    action.onClick();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('undoes only entries still in the status the change gave them', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');
    await tick(user, 'Beta');
    await tick(user, 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    // Somebody published Gamma again in the meantime.
    statusNow = { b: ContentStatus.Archived, c: ContentStatus.Published };
    const action = (toastFn.mock.calls[0][1] as { action: { onClick: () => void } }).action;
    vi.mocked(api.put).mockClear();

    action.onClick();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/contents/b/status');
    await waitFor(() =>
      expect(toastFn.mock.calls.some((c) => /1 entry was changed since/.test(c[0] as string))).toBe(true)
    );
  });

  it('reports a 409 as changed by someone else', async () => {
    const user = userEvent.setup();
    const conflict = new AxiosError('conflict', '409', undefined, undefined, {
      status: 409,
      data: {},
    } as AxiosResponse);
    vi.mocked(api.put).mockImplementation(async (url: string) => {
      if (url === '/api/contents/c/status') throw conflict;
      return { data: { message: 'ok' } };
    });
    renderList();
    await screen.findByText('Alpha');

    await tick(user, 'Beta');
    await tick(user, 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(toastFn.error.mock.calls[0][0]).toBe(
      '1 of 2 could not be changed. 1 changed by someone else, refresh.'
    );
  });

  it('does not open the entry when the padding of the select cell is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Alpha');

    const cell = bodyRows()[0].querySelector('td[data-cell="select"]') as HTMLElement;
    await user.click(cell);

    expect(push).not.toHaveBeenCalled();
  });

  it('takes its toasts down when the tenant changes', async () => {
    const user = userEvent.setup();
    toastFn.mockReturnValue('bulk-toast');
    renderList();
    await screen.findByText('Alpha');
    await tick(user, 'Beta');
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    toastFn.dismiss.mockClear();

    const { tokenStore } = await import('@/lib/api');
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: 'u1', tenant: 'globex' }))}.sig`;
    act(() => tokenStore.set(token));

    await waitFor(() => expect(toastFn.dismiss).toHaveBeenCalledWith('bulk-toast'));
    tokenStore.clear();
  });
});

describe('counts that leave types out', () => {
  it('says how many types the counts exclude', async () => {
    counts = { ...counts, uncountedTypes: ['payroll', 'tickets'] };
    renderList();
    await screen.findByText('Alpha');

    expect(await screen.findByText(/Excludes 2 types from these counts/)).toBeTruthy();
  });

  it('says nothing when none are left out', async () => {
    renderList();
    await screen.findByRole('button', { name: 'All 148' });

    expect(screen.queryByText(/Excludes/)).toBeNull();
  });
});
