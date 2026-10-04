import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContentTypeDefinition, FieldType } from '@/types/schema';
import { SiteProfileSection } from './profile-section';

function schema(fields: [string, string, FieldType][]): ContentTypeDefinition {
    return {
        name: 'site',
        displayName: 'Site',
        fields: fields.map(([name, displayName, type]) => ({ name, displayName, type, isRequired: false })),
    };
}

/** The six fields the 4.6 site blueprint adds, with its display names. */
const SITE_46 = schema([
    ['Name', 'Site name', 'string'],
    ['About', 'About', 'text'],
    ['Email', 'Contact email', 'string'],
    ['Location', 'Location', 'string'],
    ['LocationUrl', 'Location map link', 'url'],
    ['ContactUrl', 'Contact link', 'url'],
    ['SocialHandle', 'Social handle', 'string'],
]);

describe('the site profile section', () => {
    it('shows each profile field the site type declares, labelled from the schema', () => {
        render(<SiteProfileSection values={{ About: 'Service above self' }} set={() => {}} schema={SITE_46} />);

        expect(screen.getByLabelText('About')).toHaveValue('Service above self');
        for (const label of ['Contact email', 'Location', 'Location map link', 'Contact link', 'Social handle']) {
            expect(screen.getByLabelText(label)).toBeInTheDocument();
        }
    });

    it('draws nothing for a site type from before 4.6, which declares none of them', () => {
        const { container } = render(
            <SiteProfileSection values={{}} set={() => {}} schema={schema([['Name', 'Site name', 'string']])} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('shows only the fields a type declares', () => {
        render(
            <SiteProfileSection
                values={{}}
                set={() => {}}
                schema={schema([['Email', 'Contact email', 'string']])}
            />,
        );
        expect(screen.getByLabelText('Contact email')).toBeInTheDocument();
        expect(screen.queryByLabelText('About')).toBeNull();
    });

    it('writes an edit to the field by its name and flags a link that is not http or https', () => {
        const set = vi.fn();
        render(<SiteProfileSection values={{ ContactUrl: 'javascript:alert(1)' }} set={set} schema={SITE_46} />);

        expect(screen.getByText('Use a full http or https address.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Koronadal' } });
        expect(set).toHaveBeenCalledWith('Location', 'Koronadal');
    });
});
