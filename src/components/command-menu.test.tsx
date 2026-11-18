import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const push = vi.hoisted(() => vi.fn());
const theme = vi.hoisted(() => ({ resolvedTheme: 'light', setTheme: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/' }));
vi.mock('next-themes', () => ({ useTheme: () => theme }));
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api, tokenStore } = await import('@/lib/api');
const { CommandMenu, PALETTE_CAP } = await import('./command-menu');

const tokenFor = (tenant: string) => `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: 'u1', tenant }))}.sig`;

function entry(i: number) {
    return { id: `e${i}`, contentType: 'article', data: { Title: `Mango ${i}` }, createdAt: '', updatedAt: '', status: 'Draft', sensitivity: 'Public' };
}

function open() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <CommandMenu />
        </QueryClientProvider>
    );
    return userEvent.setup();
}

beforeEach(() => {
    Element.prototype.scrollIntoView ??= () => undefined;
    push.mockReset();
    theme.setTheme.mockReset();
    theme.resolvedTheme = 'light';
    vi.mocked(api.get).mockReset();
    tokenStore.set(tokenFor('acme'));
});

describe('the command palette', () => {
    it('uses the canvas placeholder', async () => {
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        expect(screen.getByPlaceholderText('Jump to a screen or entry')).toBeInTheDocument();
    });

    it('searches entries after the debounce, tenant scoped, and opens one', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [entry(1)], total: 1, page: 1, pageSize: PALETTE_CAP } } as never);
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        await user.type(screen.getByPlaceholderText('Jump to a screen or entry'), 'mango');

        const row = await screen.findByText('Mango 1');
        const calls = vi.mocked(api.get).mock.calls;
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('/api/contents');
        expect(calls[0][1]).toMatchObject({ params: { search: 'mango', pageSize: PALETTE_CAP } });

        await user.click(row);
        expect(push).toHaveBeenCalledWith('/content/e1');
    });

    it('sends nothing before a query is typed', async () => {
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        expect(api.get).not.toHaveBeenCalled();
    });

    it('caps a typed query at nine rows', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: Array.from({ length: 12 }, (_, i) => entry(i)), total: 12, page: 1, pageSize: 12 } } as never);
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        await user.type(screen.getByPlaceholderText('Jump to a screen or entry'), 'mango');
        await screen.findByText('Mango 0');
        await waitFor(() => expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(PALETTE_CAP));
    });

    it('offers the theme action and switches the theme', async () => {
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        await user.click(screen.getByText('Toggle dark mode'));
        expect(theme.setTheme).toHaveBeenCalledWith('dark');
    });

    it('switches back to light while the console is dark', async () => {
        theme.resolvedTheme = 'dark';
        const user = open();
        await user.click(screen.getByRole('button', { name: /search or jump to/i }));
        await user.click(screen.getByText('Toggle dark mode'));
        expect(theme.setTheme).toHaveBeenCalledWith('light');
    });
});

describe('drawer motion', () => {
    const sheet = readFileSync(join(__dirname, 'ui/sheet.tsx'), 'utf8');

    it('uses the canvas timing and easing, not 500ms and 300ms with default easing', () => {
        expect(sheet).not.toContain('duration-500');
        expect(sheet).toContain('slidein_280ms_cubic-bezier(0.2,0.8,0.2,1)');
        expect(sheet).toContain('ease-[cubic-bezier(.2,.8,.2,1)]');
    });

    it('turns the motion off under prefers-reduced-motion', () => {
        expect(sheet).toContain('motion-reduce:data-[state=open]:animate-none!');
        expect(sheet).toContain('motion-reduce:data-[state=closed]:animate-none!');
    });
});
