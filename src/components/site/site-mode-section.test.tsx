import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContentTypeDefinition } from '@/types/schema';

vi.mock('@/hooks/use-pages', () => ({
    usePageTree: () => ({
        isLoading: false,
        data: {
            kind: 'flat',
            rows: [{ path: '/coming-soon', title: 'Coming soon', slug: 'coming-soon', status: 'Published' }],
        },
    }),
}));

const { SiteModeSection } = await import('./site-mode-section');

const opt = (value: string) => ({ value, label: value });

function schema(options?: string[]): ContentTypeDefinition {
    return {
        name: 'site',
        displayName: 'Site',
        fields: [
            {
                name: 'Mode',
                displayName: 'Mode',
                type: 'string',
                isRequired: false,
                ...(options ? { options: options.map(opt) } : {}),
            },
            { name: 'HoldingPath', displayName: 'Holding page', type: 'string', isRequired: false },
        ],
    } as unknown as ContentTypeDefinition;
}

function renderSection(values: Record<string, unknown>, fields: ContentTypeDefinition, set = vi.fn()) {
    render(<SiteModeSection values={values} set={set} schema={fields} />);
    return set;
}

describe('SiteModeSection', () => {
    it('shows three segments and the Private note when the Mode field offers Private', () => {
        renderSection({ Mode: 'Private' }, schema(['Live', 'Holding', 'Private']));
        expect(screen.getAllByRole('radio')).toHaveLength(3);
        expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
        expect(
            screen.getByText(
                'Every public route answers 404 unless the request carries a share key or a signed-in viewer who may read the site.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/needs the Private option/)).toBeNull();
    });

    it('shows two segments and the needs-the-option line when Private is not offered', () => {
        renderSection({ Mode: 'Live' }, schema(['Live', 'Holding']));
        expect(screen.getAllByRole('radio')).toHaveLength(2);
        expect(screen.queryByRole('radio', { name: 'Private' })).toBeNull();
        expect(screen.getByText(/site type needs the Private option added/)).toBeInTheDocument();
        expect(screen.getByText('Visitors see the site. Delivery answers as published.')).toBeInTheDocument();
    });

    it('does not offer Private for a type with no options on its Mode field', () => {
        renderSection({}, schema());
        expect(screen.getAllByRole('radio')).toHaveLength(2);
        expect(screen.getByText(/site type needs the Private option added/)).toBeInTheDocument();
    });

    it('points to the share links when Private is the saved value', () => {
        renderSection({ Mode: 'Private' }, schema(['Live', 'Holding', 'Private']));
        expect(screen.getByText(/Make one in Share links/)).toBeInTheDocument();
    });

    it('points to the share links once Private is picked, and calls set with Private', () => {
        const set = renderSection({ Mode: 'Live' }, schema(['Live', 'Holding', 'Private']));
        expect(screen.queryByText(/Make one in Share links/)).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Private' }));
        expect(set).toHaveBeenCalledWith('Mode', 'Private');
    });

    it('still shows the holding page picker for Holding', () => {
        renderSection({ Mode: 'Holding' }, schema(['Live', 'Holding', 'Private']));
        expect(screen.getByLabelText('Holding page')).toBeInTheDocument();
        expect(screen.queryByText(/Make one in Share links/)).toBeNull();
    });
});
