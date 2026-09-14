import { describe, expect, it } from 'vitest';
import {
    isAbsoluteHttpUrl,
    isCssLength,
    isValidHref,
    readFooterColumns,
    readLinks,
    readOptionColors,
    readSocialLinks,
    readStringMap,
    readTopBar,
    readVariants,
    setOrRemove,
    writeOptionColors,
} from './site-settings';

describe('isValidHref', () => {
    it('accepts a path on the site and an absolute http or https URL', () => {
        expect(isValidHref('/donate')).toBe(true);
        expect(isValidHref('https://facebook.com/rckoronadal')).toBe(true);
        expect(isValidHref('http://example.com')).toBe(true);
    });

    it('refuses what the renderer drops', () => {
        expect(isValidHref('javascript:alert(1)')).toBe(false);
        expect(isValidHref('mailto:club@example.com')).toBe(false);
        expect(isValidHref('//evil.example')).toBe(false);
        expect(isValidHref('donate')).toBe(false);
        expect(isValidHref('')).toBe(false);
    });

    it('treats only an absolute URL as a url field value', () => {
        expect(isAbsoluteHttpUrl('https://rckoronadal.org')).toBe(true);
        expect(isAbsoluteHttpUrl('/logo.png')).toBe(false);
    });
});

describe('isCssLength', () => {
    it('accepts the lengths the theme documents', () => {
        expect(['2px', '999px', '680px', '1.5rem', '0', '100%'].every(isCssLength)).toBe(true);
        expect(['2', 'px', 'wide', '2 px'].some(isCssLength)).toBe(false);
    });
});

describe('the readers', () => {
    it('read an absent value as empty rather than unreadable', () => {
        expect(readStringMap(undefined)).toEqual({});
        expect(readLinks(null)).toEqual([]);
        expect(readTopBar(undefined)).toEqual({ text: '', links: [] });
        expect(readOptionColors(undefined)).toEqual([]);
    });

    it('read the documented examples', () => {
        const top = readTopBar({
            text: 'City of Koronadal, South Cotabato',
            links: [{ label: 'Facebook', href: 'https://facebook.com/rckoronadal' }],
        });
        expect(top?.links).toHaveLength(1);
        expect(top?.text).toBe('City of Koronadal, South Cotabato');

        const columns = readFooterColumns([{ heading: 'Club', links: [{ label: 'About', href: '/about' }] }]);
        expect(columns).toHaveLength(1);
        expect(columns?.[0].links[0].href).toBe('/about');

        const social = readSocialLinks([{ network: 'facebook', href: 'https://facebook.com/rckoronadal' }]);
        expect(social).toEqual([{ network: 'facebook', href: 'https://facebook.com/rckoronadal' }]);

        const variants = readVariants([{ name: 'pine', label: 'Pine', colors: { accent: '#1A6B41' } }]);
        expect(variants).toHaveLength(1);
        expect(variants?.[0].colors.accent).toBe('#1A6B41');
    });

    it('return null for a value they cannot show without losing part of it', () => {
        // An extra key would be dropped by a structured editor, so the field is shown as JSON.
        expect(readLinks([{ label: 'Donate', href: '/donate', newTab: true }])).toBeNull();
        expect(readLinks({ label: 'Donate' })).toBeNull();
        expect(readStringMap({ heading: 'Zilla Slab', size: 16 })).toBeNull();
        expect(readStringMap(['#fff'])).toBeNull();
        expect(readTopBar('City of Koronadal')).toBeNull();
        expect(readVariants([{ name: 'pine', colors: { accent: 1 } }])).toBeNull();
    });
});

describe('OptionColors', () => {
    const stored = {
        'project.AreaOfFocus': { 'Providing clean water': 'sky', 'Supporting education': 'gold' },
    };

    it('flattens to one row per option and back to the same object', () => {
        const rows = readOptionColors(stored);
        expect(rows).toHaveLength(2);
        expect(rows?.[1]).toEqual({ field: 'project.AreaOfFocus', option: 'Supporting education', color: 'gold' });
        expect(writeOptionColors(rows!)).toEqual(stored);
    });

    it('leaves out a row with no field or option rather than storing an empty key', () => {
        const written = writeOptionColors([
            { field: 'project.AreaOfFocus', option: 'Health', color: 'cranberry' },
            { field: '', option: 'Orphan', color: 'gold' },
            { field: 'project.AreaOfFocus', option: ' ', color: 'gold' },
        ]);
        expect(written).toEqual({ 'project.AreaOfFocus': { Health: 'cranberry' } });
    });
});

describe('setOrRemove', () => {
    it('removes a key set to empty instead of storing an empty string', () => {
        expect(setOrRemove({ accent: '#17458F', ink: '#1C1C1C' }, 'accent', '')).toEqual({ ink: '#1C1C1C' });
        expect(setOrRemove({}, 'accent', '#17458F')).toEqual({ accent: '#17458F' });
    });
});
