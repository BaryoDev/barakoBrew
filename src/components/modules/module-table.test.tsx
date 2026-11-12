import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
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

function setup(over: Partial<ModuleBodyProps> = {}) {
    const props: ModuleBodyProps = {
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
    return render(<ModuleTable {...props} />);
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
        await userEvent.click(screen.getByRole('switch', { name: 'alpha Off' }));
        expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(await screen.findByRole('switch', { name: 'alpha On' })).toBeTruthy();
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
});
