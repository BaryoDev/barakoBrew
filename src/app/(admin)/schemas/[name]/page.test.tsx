import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { SensitivityLevel } from '@/types/schema';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { default: SchemaDetailPage } = await import('./page');

const SCHEMA = {
  name: 'article',
  displayName: 'Articles',
  isPubliclyDeliverable: true,
  icon: { name: 'ic-coins' },
  fields: [
    { name: 'Title', displayName: 'Title', type: 'string', isRequired: true },
    {
      name: 'Salary',
      displayName: 'Salary',
      type: 'money',
      isRequired: false,
      sensitivity: SensitivityLevel.Sensitive,
      visibleToRoles: ['HR'],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/content-types') {
      return {
        data: { items: [SCHEMA], page: 1, pageSize: 20, totalItems: 1 },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
});

// One promise for every render. `use` suspends on a promise it has not seen, so a new one per render
// never settles and the page shows nothing.
const PARAMS = Promise.resolve({ name: 'article' });

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Awaited, because the first render suspends on the params promise.
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <SchemaDetailPage params={PARAMS} />
        </Suspense>
      </QueryClientProvider>
    );
  });
}

describe('the content type page', () => {
  it('no longer says fields are permanent, because fields can be added', async () => {
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    expect(screen.queryByText(/fields are permanent/i)).toBeNull();
    expect(screen.queryByText(/no update or delete for them/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a field' })).toBeTruthy();
  });

  it('has the 44px icon button in the header', async () => {
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    const button = screen.getByRole('button', { name: 'Change icon' });
    expect(button.className).toContain('size-11');
  });

  it('shows each field with a sensitivity chip you can press', async () => {
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    const table = screen.getByRole('table');
    expect(within(table).getByRole('button', { name: /Title sensitivity: Public/ })).toBeTruthy();
    expect(
      within(table).getByRole('button', {
        name: /Salary sensitivity: Sensitive/,
      })
    ).toBeTruthy();
  });

  it('offers no remove button for a field, because the API has no route for it', async () => {
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    expect(screen.queryByRole('button', { name: /remove|delete/i })).toBeNull();
  });

  it('presses a chip and sends the change with the roles the field already has', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { name: 'article', field: 'Salary' } });
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    await userEvent.click(screen.getByRole('button', { name: /Salary sensitivity: Sensitive/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe(
      '/api/content-types/article/fields/Salary/sensitivity'
    );
    expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
      sensitivity: 'Hidden',
      acknowledgeDisclosure: false,
      visibleToRoles: ['HR'],
    });
  });
});

const VERSION = '7d3f6a52-1c1e-4b6e-9a53-0d1f2b3c4d5e';
const NEWER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const STORED = {
  states: ['Recorded', 'Approved'],
  initialState: 'Recorded',
  transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
};
const WITH_REJECTED = {
  states: ['Recorded', 'Approved', 'Rejected'],
  initialState: 'Recorded',
  transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
};
const ENTRY_BLOCKER = {
  kind: 'entryState',
  state: 'Approved',
  count: 12,
  message: '12 entries are in the state Approved, which this edit removes.',
};
const TEMPLATE_WARNING = {
  kind: 'templateLink',
  transition: 'Approve',
  message: 'A template link names the transition Approve.',
};

function answer(over: Record<string, unknown> = {}) {
  return {
    data: {
      name: 'article',
      version: VERSION,
      lifecycle: WITH_REJECTED,
      dryRun: true,
      changed: false,
      canApply: true,
      blockers: [],
      warnings: [],
      ...over,
    },
  };
}

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data,
  });
}

let stored: Record<string, unknown>;

function serve(schema: Record<string, unknown>) {
  stored = schema;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/content-types') {
      return { data: { items: [stored], page: 1, pageSize: 20, totalItems: 1 } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

async function openEditor() {
  await renderPage();
  await screen.findByRole('heading', { name: 'Articles' });
  await userEvent.click(screen.getByRole('button', { name: 'Edit lifecycle' }));
}

async function addState(name: string) {
  await userEvent.type(screen.getByPlaceholderText('Recorded'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Add state' }));
}

const check = () => screen.getByRole('button', { name: 'Check' });
const save = () => screen.getByRole('button', { name: 'Save lifecycle' }) as HTMLButtonElement;

describe('editing a stored lifecycle', () => {
  beforeEach(() => {
    serve({ ...SCHEMA, lifecycle: STORED, version: VERSION });
  });

  it('a check sends a dry run with no If-Match and lists each blocker with its count, and Save stays off', async () => {
    vi.mocked(api.put).mockResolvedValue(
      answer({
        canApply: false,
        blockers: [ENTRY_BLOCKER, { kind: 'role', name: 'Editor', message: 'The role Editor may run Approve.' }],
      })
    );
    await openEditor();
    await addState('Rejected');

    await userEvent.click(check());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, body, config] = vi.mocked(api.put).mock.calls[0];
    expect(url).toBe('/api/content-types/article/lifecycle');
    expect(body).toMatchObject({ dryRun: true, lifecycle: WITH_REJECTED });
    expect(config).toBeUndefined();
    expect(await screen.findByText(ENTRY_BLOCKER.message)).toBeTruthy();
    expect(screen.getByText('The role Editor may run Approve.')).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('Save is off before any check and after the draft changes, and on only for a draft that was checked', async () => {
    vi.mocked(api.put).mockResolvedValue(answer());
    await openEditor();
    await addState('Rejected');
    expect(save().disabled).toBe(true);

    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);
    // Core answers changed: false to every dry run, so the check cannot say nothing would change.
    expect(screen.queryByText(/Nothing would change/)).toBeNull();
    expect(save().disabled).toBe(false);

    await addState('Withdrawn');
    expect(screen.queryByText(/Nothing stands in the way/)).toBeNull();
    expect(save().disabled).toBe(true);
  });

  it('a check that comes back after the draft changed is ignored', async () => {
    let late: (value: unknown) => void = () => {};
    vi.mocked(api.put).mockImplementation(
      () => new Promise((resolve) => { late = resolve; })
    );
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await addState('Withdrawn');

    await act(async () => {
      late(answer({ canApply: false, blockers: [ENTRY_BLOCKER] }));
    });

    expect(screen.queryByText(ENTRY_BLOCKER.message)).toBeNull();
    expect(save().disabled).toBe(true);
  });

  it('a check that is refused leaves Save off, even after an earlier check passed', async () => {
    vi.mocked(api.put).mockResolvedValueOnce(answer());
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);
    expect(save().disabled).toBe(false);

    vi.mocked(api.put).mockRejectedValueOnce(refusal(403, {}));
    await userEvent.click(check());

    expect(await screen.findByText(/You are not allowed to change this type/)).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('a save sends If-Match in quotes with the version the edit started from, and the stored answer shows the new states', async () => {
    vi.mocked(api.put).mockImplementation(async (_url, body) => {
      if ((body as { dryRun: boolean }).dryRun) return answer();
      stored = { ...stored, lifecycle: WITH_REJECTED, version: NEWER };
      return answer({ dryRun: false, changed: true, version: NEWER });
    });
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);

    await userEvent.click(save());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    const [, body, config] = vi.mocked(api.put).mock.calls[1];
    expect(body).toMatchObject({ dryRun: false, lifecycle: WITH_REJECTED });
    expect(config).toEqual({ headers: { 'If-Match': `"${VERSION}"` } });
    expect(await screen.findByText(/States: Recorded, Approved, Rejected\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save lifecycle' })).toBeNull();
  });

  it('a warning shows and does not stop the save', async () => {
    vi.mocked(api.put).mockResolvedValue(answer({ warnings: [TEMPLATE_WARNING] }));
    await openEditor();
    await addState('Rejected');

    await userEvent.click(check());

    expect(await screen.findByText(TEMPLATE_WARNING.message)).toBeTruthy();
    expect(save().disabled).toBe(false);
  });

  it('a 409 on save lists the blockers it carries and closes nothing', async () => {
    vi.mocked(api.put).mockImplementation(async (_url, body) => {
      if ((body as { dryRun: boolean }).dryRun) return answer();
      throw refusal(409, { errors: [{ name: 'entryState', reason: ENTRY_BLOCKER.message }], blockers: [ENTRY_BLOCKER], warnings: [] });
    });
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);

    await userEvent.click(save());

    expect(await screen.findByText(ENTRY_BLOCKER.message)).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('a 412 says someone changed it and offers the server lifecycle, which replaces the draft only when chosen', async () => {
    const SERVER = {
      states: ['Recorded', 'Approved', 'Closed'],
      initialState: 'Recorded',
      transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
    };
    vi.mocked(api.put).mockImplementation(async (_url, body) => {
      if ((body as { dryRun: boolean }).dryRun) return answer();
      throw refusal(412, { errors: [{ name: 'ifMatch', reason: 'stale' }], lifecycle: SERVER, version: NEWER });
    });
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);

    await userEvent.click(save());

    expect(await screen.findByText(/Someone changed this lifecycle since you opened it/)).toBeTruthy();
    expect((screen.getByLabelText('State 3') as HTMLInputElement).value).toBe('Rejected');

    await userEvent.click(screen.getByRole('button', { name: 'Start again from the stored lifecycle' }));

    expect((screen.getByLabelText('State 3') as HTMLInputElement).value).toBe('Closed');
    expect(screen.queryByText(/Someone changed this lifecycle/)).toBeNull();
    expect(save().disabled).toBe(true);

    await userEvent.click(check());
    await userEvent.click(await screen.findByRole('button', { name: 'Save lifecycle' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(4));
    expect(vi.mocked(api.put).mock.calls[3][2]).toEqual({ headers: { 'If-Match': `"${NEWER}"` } });
  });

  it('a 400 lists its errors', async () => {
    vi.mocked(api.put).mockImplementation(async (_url, body) => {
      if ((body as { dryRun: boolean }).dryRun) return answer();
      throw refusal(400, { errors: [{ name: 'lifecycle', reason: 'State Rejected is not allowed.' }] });
    });
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    await screen.findByText(/Nothing stands in the way/);

    await userEvent.click(save());

    expect(await screen.findByText('State Rejected is not allowed.')).toBeTruthy();
  });

  it('a 403 and a 404 say so in plain words', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(refusal(403, {}));
    await openEditor();
    await addState('Rejected');
    await userEvent.click(check());
    expect(await screen.findByText(/You are not allowed to change this type/)).toBeTruthy();

    vi.mocked(api.put).mockRejectedValueOnce(refusal(404, {}));
    await userEvent.click(check());
    expect(await screen.findByText('This content type no longer exists.')).toBeTruthy();
  });
});

describe('a type whose lifecycle cannot be edited', () => {
  it('shows the stored lifecycle and no Edit action when the API sends no version', async () => {
    serve({ ...SCHEMA, lifecycle: STORED });
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    expect(screen.getByText(/States: Recorded, Approved\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /lifecycle/i })).toBeNull();
    expect(screen.getByText('This lifecycle cannot be changed here.')).toBeTruthy();
  });

  it('reads the same for an account type, whose version is null', async () => {
    serve({ ...SCHEMA, lifecycle: STORED, version: null });
    await renderPage();
    await screen.findByRole('heading', { name: 'Articles' });

    expect(screen.queryByRole('button', { name: 'Edit lifecycle' })).toBeNull();
    expect(screen.getByText('This lifecycle cannot be changed here.')).toBeTruthy();
  });
});
