import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-modules', () => ({ useModuleEnabled: () => true }));

const { QuickActions } = await import('./quick-actions');

describe('the quick actions', () => {
    it('open Site settings on /site, not the System settings screen', () => {
        render(<QuickActions />);
        expect(screen.getByRole('link', { name: 'Site settings' })).toHaveAttribute('href', '/site');
    });
});
