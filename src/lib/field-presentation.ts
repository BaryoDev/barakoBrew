import { resolveFieldType, type FieldDefinition, type FieldType } from '@/types/schema';

/**
 * The editor hints and roles a field may declare, with the field types each is for.
 *
 * A copy of barakoCMS Core/Validation/FieldPresentation.cs, which `GET /api/meta/describe` also
 * lists as `fieldEditors` and `fieldRoles`. Copied rather than read so the builder works against an
 * API that does not describe them; the API refuses a name outside its list either way, with a
 * message that names the accepted ones.
 */
export const FIELD_EDITORS: { name: string; label: string; fieldTypes: FieldType[] }[] = [
    { name: 'blocks', label: 'Block list', fieldTypes: ['json', 'array'] },
    { name: 'menu', label: 'Menu tree', fieldTypes: ['json', 'array'] },
    { name: 'links', label: 'List of links', fieldTypes: ['json', 'array'] },
    { name: 'image', label: 'Image', fieldTypes: ['url', 'string', 'file'] },
];

export const FIELD_ROLES: { name: string; label: string; fieldTypes: FieldType[] }[] = [
    { name: 'title', label: 'Title', fieldTypes: ['string', 'text'] },
    { name: 'summary', label: 'Summary', fieldTypes: ['string', 'text', 'markdown', 'richtext'] },
    { name: 'date', label: 'Date', fieldTypes: ['date', 'datetime'] },
];

export const MAX_SECTION_LENGTH = 60;

export function editorsFor(type: string) {
    const resolved = resolveFieldType(type);
    return FIELD_EDITORS.filter((e) => resolved !== undefined && e.fieldTypes.includes(resolved));
}

export function rolesFor(type: string) {
    const resolved = resolveFieldType(type);
    return FIELD_ROLES.filter((r) => resolved !== undefined && r.fieldTypes.includes(resolved));
}

/** Why a section would be refused, or null. The API's rules, checked before the round trip. */
export function sectionProblem(section: string): string | null {
    if (section === '') return null;
    if (section.trim() === '' || section !== section.trim()) {
        return 'A section cannot be blank or start or end with a space.';
    }
    if (section.length > MAX_SECTION_LENGTH) return `A section is at most ${MAX_SECTION_LENGTH} characters.`;
    if (Array.from(section).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
        return 'A section cannot hold a line break.';
    }
    return null;
}

/** Why a route template would be refused, or null. The API checks it too. */
export function routeTemplateProblem(template: string): string | null {
    if (template === '') return null;
    if (!template.startsWith('/')) return 'Start the path with /.';
    if (template.split('{slug}').length !== 2) return 'Put {slug} in the path exactly once.';
    if (template.length > 200) return 'A path is at most 200 characters.';
    const rest = template.replace('{slug}', '');
    if (!/^[A-Za-z0-9\-._~/]*$/.test(rest)) {
        return 'Use only letters, digits, - _ . ~ and / besides {slug}.';
    }
    const segments = template.split('/').slice(1);
    if (segments.some((s) => s === '' || s === '.' || s === '..')) {
        return 'A path cannot have an empty, . or .. segment.';
    }
    return null;
}

/** Why a currency or scale would be refused, or null. */
export function currencyProblem(currency: string, scale: string): string | null {
    if (currency !== '' && !/^[A-Z]{3}$/.test(currency)) return 'A currency is three capital letters, such as USD.';
    if (scale !== '') {
        if (currency === '') return 'Set a currency before a number of decimal places.';
        const n = Number(scale);
        if (!Number.isInteger(n) || n < 0 || n > 8) return 'Decimal places are a whole number from 0 to 8.';
    }
    return null;
}

export const TOKEN_LENGTH = { min: 16, max: 128, default: 32 } as const;

export function tokenLengthProblem(length: string): string | null {
    if (length === '') return null;
    const n = Number(length);
    if (!Number.isInteger(n) || n < TOKEN_LENGTH.min || n > TOKEN_LENGTH.max) {
        return `A token is ${TOKEN_LENGTH.min} to ${TOKEN_LENGTH.max} characters long.`;
    }
    return null;
}

/**
 * The console editor a field gets: the one its hint names, or by convention when it has no hint.
 *
 * A hint wins over the name, so a block list can be called `Sections`. A field with no hint keeps
 * what it had before hints existed: blocks for a json field named `Blocks`, the menu tree for a
 * menu's `Items`. A hint on a type it is not for is ignored, since the API refuses that anyway.
 */
export function chosenEditor(
    field: Pick<FieldDefinition, 'name' | 'type' | 'editor'>,
    conventions: { isBlocks: (name: string) => boolean; isMenu: (name: string) => boolean },
): string | undefined {
    if (field.editor) {
        return editorsFor(field.type).some((e) => e.name === field.editor) ? field.editor : undefined;
    }
    if (resolveFieldType(field.type) !== 'json') return undefined;
    if (conventions.isBlocks(field.name)) return 'blocks';
    if (conventions.isMenu(field.name)) return 'menu';
    return undefined;
}
