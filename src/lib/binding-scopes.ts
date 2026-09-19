/**
 * What a binding can name at a given spot in a page: which scopes, and which paths inside each.
 *
 * The scope list is read from the site's block schema, never from here. A deployment that adds a
 * scope gets it in the picker without a console release, and one that publishes none (a barakoPress
 * older than the binding contract) gets no picker at all.
 *
 * What this file does add is the paths, which no endpoint publishes as a list: they are the fields
 * of a content type, read from `GET /api/content-types`, plus the handful of names barakoPress lays
 * over an entry's own fields so `{{item.Title}}` means the title whatever the field is called. An
 * unlisted path is always a warning and never an error, so a barakoPress that adds a name stays
 * ahead of a console that has not heard of it.
 */

import type { ContentTypeDefinition } from '@/types/schema';
import { readBindings, type Binding } from '@/lib/bindings';

/** A path a picker offers inside a scope. */
export interface BindingPath {
    path: string;
    label: string;
    /** Where it came from, so the picker can group the entry's own fields under the site's names. */
    source: 'field' | 'site';
}

export interface BindingScope {
    name: string;
    label: string;
    /** One line saying where the value comes from, shown under the scope select. */
    hint: string;
    /**
     * The paths this scope offers, or null when the console cannot list them. Null means a free
     * text box and no unknown-path warning: `query` is whatever the URL carries, and a scope this
     * console has no wording for could be anything.
     */
    paths: BindingPath[] | null;
    /** Set when the scope holds nothing at this spot, for example `item` outside a data block. */
    unavailable?: string;
    /** Set when binding it stops the page being cached and renders it per visitor. */
    perVisitor?: boolean;
}

/**
 * The names barakoPress lays over an entry's own fields, by scope.
 *
 * Not published anywhere, so they are written out here, and the cost of being wrong is one missing
 * suggestion rather than a broken page. `query` has none because it is whatever the URL carries.
 */
const SITE_NAMES: Record<string, string[]> = {
    site: ['Name', 'Tagline', 'Url', 'Logo', 'Copyright'],
    page: ['Id', 'Title', 'Slug', 'Summary', 'Body'],
    item: ['Id', 'Title', 'Slug', 'Summary', 'Body', 'Date', 'Image', 'ImageAlt', 'Url', 'Tags', 'Option', 'Color', 'Href'],
};

const WORDING: Record<string, { label: string; hint: string; perVisitor?: boolean }> = {
    site: { label: 'This site', hint: 'The site settings every page on this site shares.' },
    page: { label: 'This page', hint: 'The entry this page is, and the fields on its content type.' },
    item: { label: 'The current item', hint: 'One row of what a Load content or Repeat block read.' },
    query: { label: 'The address', hint: 'A parameter in the page address, for example ?class=A.' },
    props: { label: "The preset's own settings", hint: 'A field this preset declares, filled in where it is used.' },
    viewer: { label: 'The visitor', hint: 'Who is looking at the page.', perVisitor: true },
};

function wordingFor(name: string) {
    return WORDING[name] ?? { label: name, hint: `A value this site publishes as "${name}".` };
}

/** A content type's fields as paths, or null when the type is not one this tenant has. */
export function pathsOf(type: ContentTypeDefinition | undefined, scope: string): BindingPath[] | null {
    const names = SITE_NAMES[scope];
    if (!type && !names) return null;
    const paths: BindingPath[] = [];
    const seen = new Set<string>();
    for (const field of type?.fields ?? []) {
        if (seen.has(field.name)) continue;
        seen.add(field.name);
        paths.push({ path: field.name, label: field.displayName || field.name, source: 'field' });
    }
    for (const name of names ?? []) {
        if (seen.has(name)) continue;
        seen.add(name);
        paths.push({ path: name, label: name, source: 'site' });
    }
    return paths;
}

/** What the picker knows about where it sits: which content type feeds each entry-backed scope. */
export interface BindingContext {
    /** The type of the entry being edited, which is what `page` reads. */
    pageType?: ContentTypeDefinition;
    /** The `site` settings type. */
    siteType?: ContentTypeDefinition;
    /** The type the nearest enclosing data block loads, which is what `item` reads. */
    itemType?: ContentTypeDefinition;
    /** True when a data block encloses this spot, so `item` holds a row here. */
    insideData: boolean;
    /** The fields a preset declares, when the blocks being edited are a preset's body. */
    presetFields?: { name: string; label: string }[];
}

/**
 * The scopes a picker offers at one spot, in the order the site published them.
 *
 * Every published scope is offered. One that holds nothing here is offered too, marked with why,
 * because "item only means something inside a Load content block" is the thing an editor needs to
 * read, and hiding the option teaches nobody.
 */
export function scopesFor(names: readonly string[], context: BindingContext): BindingScope[] {
    return names.map((name) => {
        const wording = wordingFor(name);
        const scope: BindingScope = {
            name,
            label: wording.label,
            hint: wording.hint,
            paths: null,
            perVisitor: wording.perVisitor,
        };
        if (name === 'site') scope.paths = pathsOf(context.siteType, name);
        if (name === 'page') scope.paths = pathsOf(context.pageType, name);
        if (name === 'item') {
            scope.paths = pathsOf(context.itemType, name);
            if (!context.insideData) {
                scope.unavailable = 'Only inside a block that loads content or repeats over it.';
            }
        }
        if (name === 'props') {
            scope.paths = context.presetFields
                ? context.presetFields.map((f) => ({ path: f.name, label: f.label, source: 'field' as const }))
                : null;
            if (!context.presetFields) scope.unavailable = 'Only inside a preset, where the preset declares them.';
        }
        return scope;
    });
}

/** Something wrong with one binding that the page will still render, one way or another. */
export interface BindingProblem {
    binding: string;
    message: string;
}

/**
 * What is wrong with the bindings in one stored value.
 *
 * A scope the site does not publish is the typo case. A path a scope's content type no longer
 * declares is the renamed-field case the issue asks about, and the message says what the page will
 * show instead, which is the fallback or nothing at all.
 */
export function bindingProblems(value: unknown, scopes: readonly BindingScope[]): BindingProblem[] {
    const problems: BindingProblem[] = [];
    for (const binding of readBindings(value)) {
        const scope = scopes.find((s) => s.name === binding.scope);
        if (!scope) {
            problems.push({
                binding: binding.raw,
                message: `This site has nothing called "${binding.scope}", so ${renders(binding)}.`,
            });
            continue;
        }
        if (!binding.path) {
            problems.push({ binding: binding.raw, message: `No field is named, so ${renders(binding)}.` });
            continue;
        }
        if (scope.unavailable) {
            problems.push({ binding: binding.raw, message: `${scope.unavailable} Here ${renders(binding)}.` });
            continue;
        }
        // Only the first segment is checked. A path into an object field is the field's own shape,
        // which the content type does not describe.
        const head = binding.path.split('.')[0];
        if (scope.paths && !scope.paths.some((p) => p.path === head)) {
            problems.push({
                binding: binding.raw,
                message: `${scope.label} has no field called "${head}", so ${renders(binding)}.`,
            });
        }
    }
    return problems;
}

function renders(binding: Binding): string {
    return binding.fallback ? `the page shows "${binding.fallback}"` : 'the page shows nothing here';
}
