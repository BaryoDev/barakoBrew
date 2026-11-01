import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContentTypeDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

const { api } = await import('@/lib/api');
const { IconPicker } = await import('./icon-picker');

const TYPE: ContentTypeDefinition = {
    name: 'post',
    displayName: 'Post',
    fields: [{ name: 'Title', displayName: 'Title', type: 'string', isRequired: true }],
};

function wrap(schema: ContentTypeDefinition = TYPE) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <IconPicker schema={schema} />
        </QueryClientProvider>,
    );
}

function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Change icon for Post' }));
}

/** A 400 shaped as the API sends it for a refused icon: ProblemDetails with errors[].reason. */
function refused(reason: string) {
    return Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: { status: 400, data: { status: 400, errors: [{ name: 'icon', reason }] } },
    });
}

describe('the content type icon picker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows a 44px button that opens 20 glyphs and a custom SVG box', () => {
        wrap();
        const button = screen.getByRole('button', { name: 'Change icon for Post' });
        expect(button.className).toContain('size-11');

        open();

        expect(screen.getByRole('group', { name: 'Icons' }).querySelectorAll('button')).toHaveLength(20);
        expect(screen.getByLabelText('Custom SVG')).toBeInTheDocument();
    });

    it('narrows the glyphs by the search', () => {
        wrap();
        open();

        fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'key' } });

        const shown = screen.getByRole('group', { name: 'Icons' }).querySelectorAll('button');
        expect(shown).toHaveLength(1);
        expect(shown[0]).toHaveAccessibleName('Key');
    });

    it('saves a picked glyph by name', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { name: 'post', icon: { name: 'ic-key' } } });
        wrap();
        open();

        fireEvent.click(screen.getByRole('button', { name: 'Key' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save icon' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(api.put).toHaveBeenCalledWith('/api/content-types/post/icon', { icon: { name: 'ic-key' } });
    });

    it('saves a valid pasted SVG as rebuilt markup with the shape on the text colour', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { name: 'post', icon: { svg: '<svg/>' } } });
        wrap();
        open();

        fireEvent.change(screen.getByLabelText('Custom SVG'), {
            target: { value: '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="red"/></svg>' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save icon' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const [, body] = vi.mocked(api.put).mock.calls[0] as [string, { icon: { svg: string; name?: string } }];
        expect(body.icon.name).toBeUndefined();
        expect(body.icon.svg).toContain('viewBox="0 0 24 24"');
        expect(body.icon.svg).toContain('fill="currentColor"');
        expect(body.icon.svg).not.toContain('red');
    });

    it('says what is wrong with an SVG that has no viewBox and does not send it', () => {
        wrap();
        open();

        fireEvent.change(screen.getByLabelText('Custom SVG'), { target: { value: '<svg><path d="M0 0"/></svg>' } });

        expect(screen.getByText('The SVG needs a viewBox.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save icon' })).toBeDisabled();
        expect(api.put).not.toHaveBeenCalled();
    });

    // The refusal text is the mock's. What the real API refuses and cleans is in smoke/type-icon.spec.ts.
    it('shows whatever refusal the API returns for a pasted SVG and keeps the picker open', async () => {
        vi.mocked(api.put).mockRejectedValue(refused('icon.svg has a viewBox that is not four numbers.'));
        wrap();
        open();

        fireEvent.change(screen.getByLabelText('Custom SVG'), {
            target: { value: '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save icon' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('icon.svg has a viewBox that is not four numbers.');
        expect(screen.getByLabelText('Custom SVG')).toBeInTheDocument();
    });

    it('removes the icon with a null', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { name: 'post', icon: null } });
        wrap({ ...TYPE, icon: { name: 'ic-key' } });
        open();

        fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(api.put).toHaveBeenCalledWith('/api/content-types/post/icon', { icon: null });
    });
});
