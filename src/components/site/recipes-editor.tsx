'use client';

import { useId, useState } from 'react';
import { FieldError } from '@/components/content/field-error';
import { FALLBACK } from '@/components/site/theme-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPlus, IconTrash } from '@/components/icons';
import {
    MAX_DECLARATIONS,
    MAX_RECIPES,
    ONLY_VALUES,
    RECIPE_PROPERTIES,
    RECIPE_PROPERTY_GROUPS,
    classProblem,
    declarationProblem,
    previewStyle,
    recipeNameProblem,
    recipeProblem,
    referenceOptions,
    unresolvedReferences,
    writeRecipes,
    type Declaration,
    type PreviewTheme,
    type RecipeRow,
    type StoredRecipe,
} from '@/lib/recipes';
import { COLOR_ROLE_ALIASES, THEME_COLOR_NAMES, repeatedNames } from '@/lib/theme-tokens';

const SELECT =
    'border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2';

/**
 * What `{space.md}` and its neighbours stand for when the site settings leave them unset. The
 * engine's defaults at the time of writing, used only to draw the preview here.
 */
const PREVIEW_DEFAULTS: Record<string, Record<string, string>> = {
    space: { none: '0', xs: '8px', sm: '12px', md: '20px', lg: '32px', xl: '48px', xxl: '80px' },
    radii: { panel: '14px', control: '11px', pill: '999px' },
    layout: { prose: '780px', wide: '1160px', gutter: '40px', columnMin: '240px' },
    text: {
        meta: '12.5px',
        small: '14.5px',
        body: '17px',
        lead: '20px',
        subheading: '17px',
        heading: '21px',
        title: '26px',
        display: '38px',
        pageTitle: 'clamp(32px, 4.4vw, 52px)',
    },
    fonts: { heading: 'system-ui, sans-serif', body: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' },
};

function stringMap(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** The theme a preview resolves references against: the settings on screen over the defaults. */
export function previewTheme(values: Record<string, unknown>, tokens: Record<string, string>): PreviewTheme {
    const colors = stringMap(values.Colors);
    const fonts = stringMap(values.Fonts);
    const colour = (name: string) => {
        const slot = COLOR_ROLE_ALIASES[name] ?? name;
        return colors[name] || colors[slot] || FALLBACK[slot] || '#808080';
    };
    const family = (name: string | undefined, fallback: string) =>
        name && /^[A-Za-z0-9 -]{1,60}$/.test(name.trim()) ? `'${name.trim()}', ${fallback}` : fallback;
    return {
        tokens,
        groups: {
            colors: Object.fromEntries(THEME_COLOR_NAMES.map((name) => [name, colour(name)])),
            space: { ...PREVIEW_DEFAULTS.space, ...stringMap(values.Space) },
            radii: { ...PREVIEW_DEFAULTS.radii, ...stringMap(values.Radii) },
            layout: { ...PREVIEW_DEFAULTS.layout, ...stringMap(values.Layout) },
            text: { ...PREVIEW_DEFAULTS.text, ...stringMap(values.Text) },
            fonts: Object.fromEntries(
                Object.entries(PREVIEW_DEFAULTS.fonts).map(([role, fallback]) => [role, family(fonts[role], fallback)]),
            ),
        },
    };
}

function RecipePreview({ row, theme }: { row: RecipeRow; theme: PreviewTheme }) {
    const colors = theme.groups.colors;
    return (
        <div className="space-y-1">
            <div
                role="img"
                aria-label={`A sample block wearing the ${row.name.trim() || 'unnamed'} recipe`}
                className="overflow-hidden rounded-lg border p-4"
                style={{ background: colors.pageBg, color: colors.ink }}
            >
                <div data-testid="recipe-preview" style={previewStyle(row, theme)}>
                    <p style={{ color: 'var(--bp-ink)', fontSize: 12, margin: 0 }}>A sample block</p>
                    <p style={{ color: 'var(--bp-ink)', fontWeight: 700, fontSize: 18, margin: 0 }}>A heading in the block</p>
                    <p style={{ color: 'var(--bp-ink)', margin: 0 }}>Body text inside it, drawn with this recipe.</p>
                </div>
            </div>
            {row.class.trim() !== '' && (
                <p className="text-muted-foreground text-xs">
                    Classes come from the site&apos;s own stylesheet, so they do not show here.
                </p>
            )}
        </div>
    );
}

function DeclarationRow({
    id,
    recipeIndex,
    index,
    declaration,
    repeated,
    tokens,
    listId,
    onChange,
    onRemove,
}: {
    id: string;
    recipeIndex: number;
    index: number;
    declaration: Declaration;
    repeated: boolean;
    tokens: Record<string, string>;
    listId: string;
    onChange: (declaration: Declaration) => void;
    onRemove: () => void;
}) {
    const name = `Recipe ${recipeIndex + 1} property ${index + 1}`;
    const chosen = declaration.property !== '';
    const problem = chosen ? declarationProblem(declaration) : null;
    const missing = chosen && !problem ? unresolvedReferences(declaration.value, tokens) : [];
    const only = ONLY_VALUES[declaration.property];
    return (
        <li className="space-y-1">
            <div className="flex flex-wrap items-end gap-2">
                <div className="w-52 space-y-1">
                    <Label htmlFor={`${id}-property`} className="text-xs">
                        {name}
                    </Label>
                    <select
                        id={`${id}-property`}
                        className={SELECT}
                        value={declaration.property}
                        onChange={(e) => onChange({ ...declaration, property: e.target.value })}
                    >
                        <option value="">Choose a property</option>
                        {Object.entries(RECIPE_PROPERTY_GROUPS).map(([group, properties]) => (
                            <optgroup key={group} label={group}>
                                {properties.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {chosen && !RECIPE_PROPERTIES.includes(declaration.property) && (
                            <option value={declaration.property}>{declaration.property} (not allowed)</option>
                        )}
                    </select>
                </div>
                <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`${id}-value`} className="text-xs">
                        {name} value
                    </Label>
                    <Input
                        id={`${id}-value`}
                        list={only ? `${id}-only` : listId}
                        value={declaration.value}
                        placeholder={only ? only.join(' or ') : '1px solid {colors.hairline}'}
                        spellCheck={false}
                        aria-invalid={problem ? true : undefined}
                        className="font-mono text-xs"
                        onChange={(e) => onChange({ ...declaration, value: e.target.value })}
                    />
                    {only && (
                        <datalist id={`${id}-only`}>
                            {only.map((v) => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </datalist>
                    )}
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name.toLowerCase()}`} onClick={onRemove}>
                    <IconTrash />
                </Button>
            </div>
            <FieldError message={problem} />
            {missing.length > 0 && (
                <p className="text-warning text-xs">
                    {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} not in these settings. The site leaves
                    this property out unless its own config has {missing.length === 1 ? 'it' : 'them'}.
                </p>
            )}
            {repeated && <p className="text-warning text-xs">Set above already, so this one is not saved.</p>}
            {!chosen && <p className="text-muted-foreground text-xs">Not saved until a property is chosen.</p>}
        </li>
    );
}

/**
 * Style recipes, each a name, optional classes and CSS declarations from the engine's list.
 *
 * Rows are held here, as the option colours are on the Theme screen, since a recipe or a
 * declaration still being filled in has nowhere to live in the stored map.
 */
export function RecipesEditor({
    initial,
    tokens,
    theme,
    onChange,
}: {
    initial: readonly RecipeRow[];
    /** The tokens the site keeps, which a value may name as `{name}`. */
    tokens: Record<string, string>;
    theme: PreviewTheme;
    onChange: (value: Record<string, StoredRecipe>) => void;
}) {
    const id = useId();
    const [rows, setRows] = useState<RecipeRow[]>(() => initial.map((r) => ({ ...r, declarations: [...r.declarations] })));
    const commit = (next: RecipeRow[]) => {
        setRows(next);
        onChange(writeRecipes(next));
    };
    const update = (index: number, row: RecipeRow) => commit(rows.map((r, i) => (i === index ? row : r)));
    const repeated = repeatedNames(rows.map((r) => r.name));
    const listId = `${id}-references`;

    return (
        <div className="space-y-4">
            <datalist id={listId}>
                {referenceOptions(tokens).map((ref) => (
                    <option key={ref} value={ref}>
                        {ref}
                    </option>
                ))}
            </datalist>
            {rows.length === 0 && <p className="text-muted-foreground text-sm">No recipes yet.</p>}
            {rows.map((row, index) => {
                const named = row.name.trim() !== '';
                const nameProblem = named ? recipeNameProblem(row.name) : null;
                const clsProblem = classProblem(row.class);
                const whole = named ? recipeProblem(row) : null;
                const repeatedProperties = repeatedNames(row.declarations.map((d) => d.property));
                const setDeclarations = (declarations: Declaration[]) => update(index, { ...row, declarations });
                return (
                    <section
                        key={index}
                        aria-label={`Recipe ${index + 1}`}
                        data-testid="recipe"
                        className="space-y-3 rounded-lg border p-4"
                    >
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="w-52 space-y-1">
                                <Label htmlFor={`${id}-${index}-name`} className="text-xs">
                                    Recipe {index + 1} name
                                </Label>
                                <Input
                                    id={`${id}-${index}-name`}
                                    value={row.name}
                                    placeholder="card"
                                    spellCheck={false}
                                    aria-invalid={nameProblem || repeated.has(index) ? true : undefined}
                                    className="font-mono text-xs"
                                    onChange={(e) => update(index, { ...row, name: e.target.value })}
                                />
                            </div>
                            <div className="min-w-48 flex-1 space-y-1">
                                <Label htmlFor={`${id}-${index}-class`} className="text-xs">
                                    Recipe {index + 1} classes (optional)
                                </Label>
                                <Input
                                    id={`${id}-${index}-class`}
                                    value={row.class}
                                    placeholder="lift"
                                    spellCheck={false}
                                    aria-invalid={clsProblem ? true : undefined}
                                    className="font-mono text-xs"
                                    onChange={(e) => update(index, { ...row, class: e.target.value })}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove recipe ${index + 1}`}
                                onClick={() => commit(rows.filter((_, i) => i !== index))}
                            >
                                <IconTrash />
                            </Button>
                        </div>
                        <FieldError message={nameProblem} />
                        <FieldError message={clsProblem} />
                        {repeated.has(index) && (
                            <p className="text-warning text-xs">A recipe above has this name, so this one is not saved.</p>
                        )}
                        {!named && <p className="text-muted-foreground text-xs">Not saved until it has a name.</p>}

                        {row.declarations.length > 0 && (
                            <ol aria-label={`Recipe ${index + 1} properties`} className="space-y-3">
                                {row.declarations.map((declaration, d) => (
                                    <DeclarationRow
                                        key={d}
                                        id={`${id}-${index}-${d}`}
                                        recipeIndex={index}
                                        index={d}
                                        declaration={declaration}
                                        repeated={repeatedProperties.has(d)}
                                        tokens={tokens}
                                        listId={listId}
                                        onChange={(next) => setDeclarations(row.declarations.map((x, i) => (i === d ? next : x)))}
                                        onRemove={() => setDeclarations(row.declarations.filter((_, i) => i !== d))}
                                    />
                                ))}
                            </ol>
                        )}
                        <FieldError message={whole} />
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={row.declarations.length >= MAX_DECLARATIONS}
                            onClick={() => update(index, { ...row, declarations: [...row.declarations, { property: '', value: '' }] })}
                        >
                            <IconPlus className="size-3" />
                            Add a property to recipe {index + 1}
                        </Button>
                        <RecipePreview row={row} theme={theme} />
                    </section>
                );
            })}
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= MAX_RECIPES}
                onClick={() => setRows([...rows, { name: '', class: '', declarations: [] }])}
            >
                <IconPlus />
                Add recipe
            </Button>
        </div>
    );
}
