import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { TypeIconPicker } = await import('./type-icon-picker');

function renderPicker(icon: { name?: string; svg?: string } | null = null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <TypeIconPicker typeName="article" displayName="Articles" icon={icon} />
        </QueryClientProvider>,
    );
}

const lastBody = () => vi.mocked(api.put).mock.calls.at(-1)![1] as { icon: { name?: string; svg?: string } | null };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.put).mockResolvedValue({ data: { name: 'article', icon: { name: 'ic-coins' } } });
});

describe('the type icon picker', () => {
    it('is a 44px button that opens twenty glyphs, and reports whether it is open', async () => {
        const user = userEvent.setup();
        renderPicker();
        const button = screen.getByRole('button', { name: 'Change icon' });
        expect(button.className).toContain('size-11');
        expect(button.getAttribute('aria-expanded')).toBe('false');

        await user.click(button);

        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('group', { name: 'Icons' }).querySelectorAll('button')).toHaveLength(20);
    });

    it('saves a picked glyph as { name } with PUT .../icon, and marks the current one pressed', async () => {
        const user = userEvent.setup();
        renderPicker({ name: 'ic-flag' });
        await user.click(screen.getByRole('button', { name: 'Change icon' }));
        expect(screen.getByRole('button', { name: 'Flag' }).getAttribute('aria-pressed')).toBe('true');

        await user.click(screen.getByRole('button', { name: 'Coins' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/article/icon');
        expect(lastBody()).toEqual({ icon: { name: 'ic-coins' } });
    });

    it('sends a valid custom svg cleaned, with shapes forced to currentColor', async () => {
        const user = userEvent.setup();
        renderPicker();
        await user.click(screen.getByRole('button', { name: 'Change icon' }));

        await user.click(screen.getByLabelText('Custom SVG'));
        await user.paste(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" onload="x()"><script>x()</script><path d="M1 1 L9 9" fill="red"/></svg>',
        );
        await user.click(screen.getByRole('button', { name: 'Use this SVG' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        const svg = lastBody().icon!.svg!;
        expect(svg).toContain('viewBox="0 0 32 32"');
        expect(svg).toContain('fill="currentColor"');
        expect(svg).not.toMatch(/script|onload|red/);
    });

    it('refuses an svg with no viewBox locally and sends nothing', async () => {
        const user = userEvent.setup();
        renderPicker();
        await user.click(screen.getByRole('button', { name: 'Change icon' }));

        await user.click(screen.getByLabelText('Custom SVG'));
        await user.paste('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>');
        await user.click(screen.getByRole('button', { name: 'Use this SVG' }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/viewBox and at least one/);
        expect(api.put).not.toHaveBeenCalled();
    });

    it('shows the API refusal as it words it when the server rejects the icon', async () => {
        const user = userEvent.setup();
        const response = { status: 400, data: { message: 'icon.svg has no usable shape.' } } as AxiosResponse;
        vi.mocked(api.put).mockRejectedValue(new AxiosError('bad', '400', undefined, undefined, response));
        renderPicker();
        await user.click(screen.getByRole('button', { name: 'Change icon' }));

        await user.click(screen.getByLabelText('Custom SVG'));
        await user.paste('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M1 1"/></svg>');
        await user.click(screen.getByRole('button', { name: 'Use this SVG' }));

        expect((await screen.findByRole('alert')).textContent).toBe('icon.svg has no usable shape.');
    });
});
