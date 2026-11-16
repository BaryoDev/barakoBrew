import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type ToastOptions = { action?: { label: string; onClick: () => void }; onAutoClose?: () => void; onDismiss?: () => void };
const toastFn = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
    toast: Object.assign(toastFn, { success: vi.fn(), error: vi.fn() }),
}));

const { ModuleTable, nextSort } = await import('./module-table');
import type { ModuleRow, ModuleBodyProps } from './module-table';

const rows: ModuleRow[] = [
    {
        id: 'b',
        title: 'beta',
        on: true,
        cells: { name: 'beta', count: 10, state: 'On' },
        fields: [{ label: 'Description', value: 'second' }],
        actions: [{ kind: 'remove', label: 'Remove', commit: () => undefined }],
    },
    { id: 'a', title: 'alpha', on: false, cells: { name: 'alpha', count: 9, state: 'Off' }, fields: [] },
    { id: 'c', title: 'gamma', on: true, cells: { name: 'gamma', count: 100, state: 'On' }, fields: [] },
];

function propsFor(over: Partial<ModuleBodyProps> = {}): ModuleBodyProps {
    return {
        moduleLabel: 'Demo',
        title: 'Things',
        noun: 'things',
        stats: [],
        columns: [
            { key: 'name', label: 'Name' },
            { key: 'count', label: 'Count', kind: 'number' },
            { key: 'state', label: 'State', kind: 'switch' },
        ],
        rows,
        callFor: (r) => `DELETE /api/things/${r.id}`,
        ...over,
    };
}

function setup(over: Partial<ModuleBodyProps> = {}) {
    return render(<ModuleTable {...propsFor(over)} />);
}

const names = () => screen.getAllByTestId('module-row').map((r) => within(r).getAllByRole('cell')[0].textContent);

beforeEach(() => toastFn.mockClear());

describe('nextSort', () => {
    it('cycles asc, desc, off, and restarts on another column', () => {
        const a = nextSort(null, 'name');
        expect(a).toEqual({ key: 'name', dir: 'asc' });
        const d = nextSort(a, 'name');
        expect(d).toEqual({ key: 'name', dir: 'desc' });
        expect(nextSort(d, 'name')).toBeNull();
        expect(nextSort(d, 'count')).toEqual({ key: 'count', dir: 'asc' });
    });
});

describe('ModuleTable sorting', () => {
    it('sorts asc, desc, then back to the given order', async () => {
        setup();
        expect(names()).toEqual(['beta', 'alpha', 'gamma']);
        const head = screen.getByRole('button', { name: /^Name/ });
        await userEvent.click(head);
        expect(names()).toEqual(['alpha', 'beta', 'gamma']);
        expect(head.textContent).toContain('▲');
        await userEvent.click(head);
        expect(names()).toEqual(['gamma', 'beta', 'alpha']);
        expect(head.textContent).toContain('▼');
        await userEvent.click(head);
        expect(names()).toEqual(['beta', 'alpha', 'gamma']);
    });

    it('sorts numbers numerically, not as text', async () => {
        setup();
        await userEvent.click(screen.getByRole('button', { name: /^Count/ }));
        expect(names()).toEqual(['alpha', 'beta', 'gamma']);
        await userEvent.click(screen.getByRole('button', { name: /^Count/ }));
        expect(names()).toEqual(['gamma', 'beta', 'alpha']);
    });
});

describe('ModuleTable filter', () => {
    it('says what matched nothing', async () => {
        setup();
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter things' }), 'zzz');
        expect(screen.getByText('Nothing matches "zzz"')).toBeTruthy();
    });

    it('narrows the rows and the count', async () => {
        setup();
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter things' }), 'alp');
        expect(names()).toEqual(['alpha']);
        expect(screen.getByTestId('row-count').textContent).toBe('1');
    });

    it('has no filter box while the table shows a state', () => {
        setup({ state: { kind: 'message', text: 'Nothing to list.' } });
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByText('Nothing to list.')).toBeTruthy();
    });
});

describe('ModuleTable switch', () => {
    it('toggles in place with a toast and does not open the drawer', async () => {
        const onToggle = vi.fn().mockResolvedValue(undefined);
        setup({ onToggle });
        await userEvent.click(screen.getByRole('switch', { name: 'alpha' }));
        expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true);
        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(screen.getByRole('switch', { name: 'alpha' }).getAttribute('aria-checked')).toBe('true'));
    });

    it('labels the switch with the row title only', () => {
        setup();
        expect(screen.getByRole('switch', { name: 'beta' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.queryByRole('switch', { name: 'beta On' })).toBeNull();
    });

    it('drops an override once the server row matches, so a later refetch wins', async () => {
        const onToggle = vi.fn().mockResolvedValue(undefined);
        const { rerender } = setup({ onToggle });
        await userEvent.click(screen.getByRole('switch', { name: 'alpha' }));
        await waitFor(() => expect(screen.getByRole('switch', { name: 'alpha' }).getAttribute('aria-checked')).toBe('true'));
        const withOn = (on: boolean) => rows.map((r) => (r.id === 'a' ? { ...r, on } : r));
        rerender(<ModuleTable {...propsFor({ onToggle, rows: withOn(true) })} />);
        rerender(<ModuleTable {...propsFor({ onToggle, rows: withOn(false) })} />);
        expect(screen.getByRole('switch', { name: 'alpha' }).getAttribute('aria-checked')).toBe('false');
    });

    it('disables the switch while a toggle is pending and ignores a second click', async () => {
        let finish: () => void = () => undefined;
        const onToggle = vi.fn(() => new Promise<void>((res) => (finish = res)));
        setup({ onToggle });
        const sw = screen.getByRole('switch', { name: 'alpha' });
        await userEvent.click(sw);
        expect((screen.getByRole('switch', { name: 'alpha' }) as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(screen.getByRole('switch', { name: 'alpha' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        await act(async () => finish());
        expect((screen.getByRole('switch', { name: 'alpha' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('rolls back to the value before the click when the toggle fails', async () => {
        const onToggle = vi.fn().mockRejectedValue(new Error('no'));
        setup({ onToggle });
        await userEvent.click(screen.getByRole('switch', { name: 'beta' }));
        await waitFor(() => expect(onToggle).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByRole('switch', { name: 'beta' }).getAttribute('aria-checked')).toBe('true'));
    });
});

describe('ModuleTable row keys', () => {
    it('opens the drawer on Space and prevents the page scroll', () => {
        setup();
        const row = screen.getAllByTestId('module-row')[0];
        const notCancelled = fireEvent.keyDown(row, { key: ' ' });
        expect(notCancelled).toBe(false);
    });

    it('opens the drawer on Enter', async () => {
        setup();
        fireEvent.keyDown(screen.getAllByTestId('module-row')[0], { key: 'Enter' });
        expect(await screen.findByRole('dialog')).toBeTruthy();
    });

    it('ignores keys that come from the switch', () => {
        setup();
        const sw = within(screen.getAllByTestId('module-row')[0]).getByRole('switch');
        fireEvent.keyDown(sw, { key: ' ' });
        fireEvent.keyDown(sw, { key: 'Enter' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('ModuleTable sort values', () => {
    const sortRows: ModuleRow[] = [
        { id: '1', title: 'r1', cells: { name: 'item 10', n: 5, when: 'Never' }, sort: { when: null }, fields: [] },
        { id: '2', title: 'r2', cells: { name: 'item 2', when: '2024-05-01' }, sort: { when: '2024-05-01T10:00:00Z' }, fields: [] },
        { id: '3', title: 'r3', cells: { name: 'Item 1', n: 40, when: '2023-01-01' }, sort: { when: '2023-01-01T00:00:00Z' }, fields: [] },
    ];
    const cols: ModuleBodyProps['columns'] = [
        { key: 'name', label: 'Name' },
        { key: 'n', label: 'N', kind: 'number' },
        { key: 'when', label: 'When', kind: 'date' },
    ];
    const order = () => screen.getAllByTestId('module-row').map((r) => within(r).getAllByRole('cell')[0].textContent);

    it('sorts text with numeric collation', async () => {
        setup({ rows: sortRows, columns: cols });
        await userEvent.click(screen.getByRole('button', { name: /^Name/ }));
        expect(order()).toEqual(['Item 1', 'item 2', 'item 10']);
    });

    it('puts missing numbers last in both directions', async () => {
        setup({ rows: sortRows, columns: cols });
        await userEvent.click(screen.getByRole('button', { name: /^N\b/ }));
        expect(order()).toEqual(['item 10', 'Item 1', 'item 2']);
        await userEvent.click(screen.getByRole('button', { name: /^N\b/ }));
        expect(order()).toEqual(['Item 1', 'item 10', 'item 2']);
    });

    it('sorts a date column on the raw value with Never last', async () => {
        setup({ rows: sortRows, columns: cols });
        await userEvent.click(screen.getByRole('button', { name: /^When/ }));
        expect(order()).toEqual(['Item 1', 'item 2', 'item 10']);
        await userEvent.click(screen.getByRole('button', { name: /^When/ }));
        expect(order()).toEqual(['item 2', 'Item 1', 'item 10']);
    });
});

describe('ModuleTable view', () => {
    it('defaults to List and switches to Grid', async () => {
        setup();
        const list = screen.getByRole('radio', { name: 'List' });
        expect(list.getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('table')).toBeTruthy();
        expect(screen.queryByTestId('module-grid')).toBeNull();
        await userEvent.click(screen.getByRole('radio', { name: 'Grid' }));
        expect(screen.getByTestId('module-grid')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });
});

describe('ModuleTable drawer', () => {
    it('opens on a row click and shows the API call in the footer', async () => {
        setup();
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        const drawer = await screen.findByRole('dialog');
        expect(within(drawer).getByText('DELETE /api/things/b')).toBeTruthy();
        expect(within(drawer).getByText('Description')).toBeTruthy();
    });

    it('removes a row and puts it back when Undo is pressed', async () => {
        const commit = vi.fn();
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit }] } : r,
        );
        setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        const drawer = await screen.findByRole('dialog');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Remove' }));
        expect(names()).toEqual(['alpha', 'gamma']);
        const opts = toastFn.mock.calls[0][1] as ToastOptions;
        expect(opts.action?.label).toBe('Undo');
        act(() => opts.action!.onClick());
        expect(names()).toEqual(['beta', 'alpha', 'gamma']);
        act(() => opts.onAutoClose?.());
        expect(commit).not.toHaveBeenCalled();
    });

    it('commits the removal when the toast closes without Undo', async () => {
        const commit = vi.fn().mockResolvedValue(undefined);
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit }] } : r,
        );
        setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        const opts = toastFn.mock.calls[0][1] as ToastOptions;
        await act(async () => opts.onAutoClose?.());
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('commits a pending removal on pagehide and only once', async () => {
        const commit = vi.fn().mockResolvedValue(undefined);
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit }] } : r,
        );
        setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        expect(commit).not.toHaveBeenCalled();
        act(() => {
            window.dispatchEvent(new Event('pagehide'));
        });
        expect(commit).toHaveBeenCalledTimes(1);
        const opts = toastFn.mock.calls[0][1] as ToastOptions;
        await act(async () => opts.onAutoClose?.());
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('commits a pending removal when the table unmounts', async () => {
        const commit = vi.fn().mockResolvedValue(undefined);
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit }] } : r,
        );
        const { unmount } = setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        unmount();
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('does not commit on unmount after Undo', async () => {
        const commit = vi.fn();
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit }] } : r,
        );
        const { unmount } = setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        act(() => (toastFn.mock.calls[0][1] as ToastOptions).action!.onClick());
        unmount();
        expect(commit).not.toHaveBeenCalled();
    });

    it('uses the failure text of a remove action in the toast', async () => {
        const commit = vi.fn().mockRejectedValue(new Error('409'));
        const failure = vi.fn(() => 'Used by 3 entries');
        const withCommit = rows.map((r) =>
            r.id === 'b' ? { ...r, actions: [{ kind: 'remove' as const, label: 'Remove', commit, failure }] } : r,
        );
        setup({ rows: withCommit });
        await userEvent.click(screen.getAllByTestId('module-row')[0]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        await act(async () => (toastFn.mock.calls[0][1] as ToastOptions).onAutoClose?.());
        const { toast } = await import('sonner');
        expect(toast.error).toHaveBeenCalledWith('Used by 3 entries');
    });

    it('disables the action while it runs and keeps the drawer open when it fails', async () => {
        let fail: (e: Error) => void = () => undefined;
        const run = vi.fn(() => new Promise<void>((_, rej) => (fail = rej)));
        const withRun = rows.map((r) =>
            r.id === 'a' ? { ...r, actions: [{ kind: 'run' as const, label: 'Resolve', done: 'Done', run }] } : r,
        );
        setup({ rows: withRun });
        await userEvent.click(screen.getAllByTestId('module-row')[1]);
        const drawer = await screen.findByRole('dialog');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Resolve' }));
        expect((within(drawer).getByRole('button', { name: 'Resolve' }) as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(within(drawer).getByRole('button', { name: 'Resolve' }));
        expect(run).toHaveBeenCalledTimes(1);
        await act(async () => fail(new Error('no')));
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Resolve' }) as HTMLButtonElement).disabled).toBe(false);
        const { toast } = await import('sonner');
        expect(toast.error).toHaveBeenCalledWith('Resolve failed');
    });

    it('closes the drawer when the action succeeds', async () => {
        const run = vi.fn().mockResolvedValue(undefined);
        const withRun = rows.map((r) =>
            r.id === 'a' ? { ...r, actions: [{ kind: 'run' as const, label: 'Resolve', done: 'Done', run }] } : r,
        );
        setup({ rows: withRun });
        await userEvent.click(screen.getAllByTestId('module-row')[1]);
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Resolve' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
