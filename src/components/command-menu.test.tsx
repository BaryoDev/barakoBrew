import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ContentTypeDefinition } from '@/types/schema';

const push = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { CommandMenu } = await import('./command-menu');

beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => push.mockReset());

const POST: ContentTypeDefinition = { name: 'post', displayName: 'Blog post', fields: [] };
const SETTINGS: ContentTypeDefinition = { name: 'site-settings', displayName: 'Site settings', fields: [], isSingleton: true };

function openMenu(types?: ContentTypeDefinition[]) {
    render(<CommandMenu types={types} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    return screen.getByRole('dialog');
}

describe('the command menu content types', () => {
    it('lists the types under their own heading', () => {
        const dialog = openMenu([POST, SETTINGS]);

        const group = within(dialog).getByText('Content types').closest('[cmdk-group]') as HTMLElement;
        const items = within(group).getAllByRole('option');
        expect(items).toHaveLength(2);
        expect(items.map((i) => i.textContent)).toEqual(['Blog post', 'Site settings']);
    });

    it('opens the entries list for a normal type', () => {
        const dialog = openMenu([POST, SETTINGS]);

        fireEvent.click(within(dialog).getByRole('option', { name: 'Blog post' }));

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/content?type=post');
    });

    it('opens the single edit screen for a singleton type', () => {
        const dialog = openMenu([POST, SETTINGS]);

        fireEvent.click(within(dialog).getByRole('option', { name: 'Site settings' }));

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/content/singleton/site-settings');
    });

    it('shows no Content types group for an empty list or none', () => {
        const dialog = openMenu([]);
        expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(0);
        expect(within(dialog).queryByText('Content types')).toBeNull();
    });

    it('shows no Content types group while the types have not loaded', () => {
        const dialog = openMenu(undefined);
        expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(0);
        expect(within(dialog).queryByText('Content types')).toBeNull();
    });
});
