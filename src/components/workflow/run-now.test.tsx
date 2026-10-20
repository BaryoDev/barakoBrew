import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { accessFrom } = await import('@/lib/access');
type AccessResult = ReturnType<typeof accessFrom>;
const EVERYTHING = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);
let access: AccessResult = EVERYTHING;
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));

let tenant: string | null = 'acme';
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => tenant }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { api } = await import('@/lib/api');
const { AxiosError, AxiosHeaders } = await import('axios');
const { RunNowButton } = await import('./run-now');

const ENTRY = { id: '11111111-2222-3333-4444-555555555555', contentType: 'post', data: { Title: 'Spring launch' } };
const ENTRY_B = { id: '99999999-2222-3333-4444-555555555555', contentType: 'post', data: { Title: 'Autumn recap' } };
const WORKFLOW = { id: 'wf-1', name: 'Announce', triggerContentType: 'post', enabled: true };

function refusal(status: number, data: unknown = {}) {
  return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function renderButton(workflow: Record<string, unknown> = WORKFLOW, props: { available?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const tree = () => (
    <QueryClientProvider client={client}>
      <RunNowButton workflow={workflow as never} {...props} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { invalidate, rerender: () => view.rerender(tree()) };
}

/** Opens the dialog, picks the entry, and stops on the confirm step. */
async function toConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  fireEvent.click(await screen.findByRole('button', { name: /Spring launch/ }));
}

function confirmButton() {
  const dialog = screen.getByRole('dialog');
  return within(dialog).getByRole('button', { name: 'Run now' });
}

beforeEach(() => {
  access = EVERYTHING;
  tenant = 'acme';
  push.mockReset();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockResolvedValue({
    data: { items: [ENTRY], page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  });
});

describe('Run now', () => {
  it('sends nothing until the confirm step, which names the entry by title and id', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    fireEvent.click(await screen.findByRole('button', { name: /Spring launch/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Spring launch')).toBeInTheDocument();
    expect(within(dialog).getByText(ENTRY.id)).toBeInTheDocument();
    expect(within(dialog).getByText(/real email/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('asks for entries of the workflow content type, searched and paged', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await screen.findByRole('button', { name: /Spring launch/ });

    expect(api.get).toHaveBeenCalledWith(
      '/api/contents',
      expect.objectContaining({ params: expect.objectContaining({ contentType: 'post', page: 1, pageSize: 10 }) }),
    );
  });

  it('starts the run with the entry and an idempotency key, then opens the run', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { runId: 'run-9', repeated: false } });
    const { invalidate } = renderButton();
    await toConfirm();

    fireEvent.click(confirmButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith('/workflow-runs?run=run-9'));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/api/workflows/wf-1/run');
    expect(body).toEqual({ entryId: ENTRY.id });
    expect((config as { headers: Record<string, string> }).headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workflow-health'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workflow-runs'] });
  });

  it('sends one request for two clicks before a re-render', async () => {
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
    renderButton();
    await toConfirm();

    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    // Let anything a second click queued run, then count again.
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('cannot go back while the request is in flight', async () => {
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
    renderButton();
    await toConfirm();

    fireEvent.click(confirmButton());

    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Back' })).toBeDisabled());
  });

  it('offers entries of every type the workflow fires on, once each', async () => {
    renderButton({ ...WORKFLOW, triggerContentType: 'post', triggerContentTypes: ['page', 'post', 'event'] });
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await screen.findByRole('button', { name: /Spring launch/ });

    const select = screen.getByRole('combobox', { name: 'Entry type' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['post', 'page', 'event']);

    fireEvent.change(select, { target: { value: 'page' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/api/contents',
        expect.objectContaining({ params: expect.objectContaining({ contentType: 'page', page: 1 }) }),
      ),
    );
  });

  it('makes a new idempotency key for each open, after a success and after a cancel', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { runId: 'run-9' } });
    renderButton();

    await toConfirm();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));

    await toConfirm();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Back' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await toConfirm();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));

    const keys = vi.mocked(api.post).mock.calls.map((call) => (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps the same key for a retry inside one open after a failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(refusal(500)).mockResolvedValueOnce({ data: { runId: 'run-9' } });
    renderButton();
    await toConfirm();

    fireEvent.click(confirmButton());
    await screen.findByRole('alert');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));

    const keys = vi.mocked(api.post).mock.calls.map((call) => (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key']);
    expect(keys[0]).toBe(keys[1]);
  });

  it('uses a different key for a different entry after a failure, and the same key when the same entry is retried', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { items: [ENTRY, ENTRY_B], page: 1, pageSize: 10, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    vi.mocked(api.post).mockRejectedValue(refusal(500));
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    fireEvent.click(await screen.findByRole('button', { name: /Spring launch/ }));
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Back' }));
    fireEvent.click(await screen.findByRole('button', { name: /Autumn recap/ }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    fireEvent.click(await screen.findByRole('button', { name: /Spring launch/ }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));

    const calls = vi.mocked(api.post).mock.calls;
    expect(calls).toHaveLength(3);
    const keyOf = (i: number) => (calls[i][2] as { headers: Record<string, string> }).headers['Idempotency-Key'];
    expect(calls[0][1]).toEqual({ entryId: ENTRY.id });
    expect(calls[1][1]).toEqual({ entryId: ENTRY_B.id });
    expect(keyOf(0)).not.toBe(keyOf(1));
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it('shows a pending confirm button while the request is in flight', async () => {
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
    renderButton();
    await toConfirm();

    fireEvent.click(confirmButton());

    const pending = await within(screen.getByRole('dialog')).findByRole('button', { name: 'Starting…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
  });

  it('closes the dialog when the tenant changes, so the entry is not posted under the new token', async () => {
    const { rerender } = renderButton();
    await toConfirm();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    tenant = 'globex';
    rerender();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('gives the reason a switched-off workflow cannot run to assistive technology', () => {
    renderButton({ ...WORKFLOW, enabled: false });
    const button = screen.getByRole('button', { name: 'Run now' });
    expect(button).toHaveAccessibleDescription('Switch the workflow on to run it.');
  });

  it.each([
    [403, {}, 'You do not have permission to run workflows.'],
    [404, {}, 'That workflow or entry no longer exists'],
    [400, { message: 'That workflow does not run on entries of type page.' }, 'That workflow does not run on entries of type page.'],
    [409, { message: 'That workflow is switched off. Switch it on first, then run it.' }, 'That workflow is switched off'],
    [409, { message: "That entry does not meet the workflow's conditions: status must be Live." }, 'does not meet the workflow'],
  ])('shows a %i and opens no run', async (status, data, shown) => {
    vi.mocked(api.post).mockRejectedValue(refusal(status, data));
    renderButton();
    await toConfirm();

    fireEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('is disabled for a switched-off workflow and enabled when enabled is undefined', () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <RunNowButton workflow={{ ...WORKFLOW, enabled: false }} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    unmount();

    renderButton({ id: 'wf-1', name: 'Announce', triggerContentType: 'post' });
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled();
  });

  it('is hidden when the routes are not there', () => {
    renderButton(WORKFLOW, { available: false });
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });
});

describe('Run now and the capability', () => {
  it('shows to a caller who holds run_workflows', () => {
    access = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['run_workflows'] }, []);
    expect(access.known).toBe(true);
    renderButton();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
  });

  it('is hidden with the capabilities known and run_workflows not among them', () => {
    access = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['manage_workflows'] }, ['Admin']);
    expect(access.known).toBe(true);
    renderButton();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('falls back to the Admin role when the capabilities are not known', () => {
    access = accessFrom(null, ['Admin']);
    expect(access.known).toBe(false);
    renderButton();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
  });

  it('is hidden when the capabilities are not known and the role is not Admin', () => {
    access = accessFrom(null, ['Editor']);
    expect(access.known).toBe(false);
    renderButton();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });
});
