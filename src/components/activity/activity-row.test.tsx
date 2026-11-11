import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityRow } from './activity-row';

const NOW = Date.parse('2026-11-06T10:10:00Z');
const row = (over: Record<string, unknown>) => ({ id: 'a', at: '2026-11-06T10:00:00Z', kind: 'published', ...over });

function renderRow(item: ReturnType<typeof row>) {
    return render(
        <ul>
            <ActivityRow item={item} now={NOW} />
        </ul>,
    );
}

describe('ActivityRow', () => {
    it('is at least 48px, with time, sentence and the kind in mono', () => {
        renderRow(row({ actor: { name: 'Ana' }, subject: { title: 'New pastry menu' }, text: 'Published an entry.' }));
        const li = screen.getByRole('listitem');
        expect(li.className).toContain('min-h-12');
        expect(li).toHaveTextContent('10 min');
        expect(li).toHaveTextContent('Ana published New pastry menu');
        expect(screen.getByText('published').className).toContain('font-mono');
    });

    it('does not repeat the title that core keeps out of text', () => {
        renderRow(row({ actor: { name: 'Ana' }, subject: { title: 'Menu' }, text: 'Published an entry.' }));
        expect(screen.getByRole('listitem').textContent).not.toContain('Published an entry.');
    });

    it('draws an unknown kind as its name in mono', () => {
        renderRow(row({ kind: 'quota.reached', actor: { name: 'System' }, text: 'Something happened.' }));
        expect(screen.getByText('quota.reached').className).toContain('font-mono');
        expect(screen.getByRole('listitem')).toHaveTextContent('Something happened.');
    });

    it('colours a warning kind with the warning ink', () => {
        renderRow(row({ kind: 'bounced', severity: 'warning', actor: { name: 'Resend' }, subject: { title: 'old@gone.example' } }));
        expect(screen.getByText('bounced').className).toContain('text-warning');
    });

    it('links only a ref that stays on the console', () => {
        const { unmount } = renderRow(row({ ref: '/content/1' }));
        expect(screen.getByRole('link')).toHaveAttribute('href', '/content/1');
        unmount();
        renderRow(row({ ref: '//evil.example' }));
        expect(screen.queryByRole('link')).toBeNull();
    });
});
