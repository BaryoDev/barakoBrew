import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useStoredPreference } from './use-stored-preference';

const VIEWS = ['cards', 'list'] as const;

function Screen({ storageKey }: { storageKey: string }) {
    const [view, setView] = useStoredPreference<(typeof VIEWS)[number]>(storageKey, VIEWS, 'cards');
    return (
        <button type="button" onClick={() => setView(view === 'cards' ? 'list' : 'cards')}>
            {view}
        </button>
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('a remembered view preference', () => {
    it('starts at the fallback and keeps what was chosen', async () => {
        render(<Screen storageKey="test_view_kept" />);
        expect(screen.getByRole('button')).toHaveTextContent('cards');

        await act(async () => {
            screen.getByRole('button').click();
        });
        expect(screen.getByRole('button')).toHaveTextContent('list');
        expect(localStorage.getItem('test_view_kept')).toBe('list');
    });

    it('ignores a stored value that is not one of the choices', () => {
        // Someone else's key, an older release's spelling, or a person editing site data by hand.
        localStorage.setItem('test_view_junk', 'grid');
        render(<Screen storageKey="test_view_junk" />);
        expect(screen.getByRole('button')).toHaveTextContent('cards');
    });

    // The path that runs when storage fails rather than when it works. A private window, or a
    // browser with site data blocked, throws on both calls. The screen has to render anyway: this
    // is a view preference, not a feature.
    it('works in a browser that refuses storage', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage disabled');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage disabled');
        });

        render(<Screen storageKey="test_view_blocked" />);
        expect(screen.getByRole('button')).toHaveTextContent('cards');

        await act(async () => {
            screen.getByRole('button').click();
        });
        // Still the fallback, because nothing could be stored, and no error reached the screen.
        expect(screen.getByRole('button')).toHaveTextContent('cards');
    });
});
