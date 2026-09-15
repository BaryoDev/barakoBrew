'use client';

import { useId, useState } from 'react';
import { SiteForm } from '@/components/site/site-form';
import { ColourInput, Section, Structured, TextField } from '@/components/site/editors';
import { ThemePreview } from '@/components/site/theme-preview';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPlus, IconTrash } from '@/components/icons';
import {
    AA_NORMAL,
    checkAgainst,
    checkContrast,
    countBelow,
    formatRatio,
    type ContrastResult,
} from '@/lib/contrast';
import {
    COLOR_SLOTS,
    FONT_ROLES,
    LAYOUT_KEYS,
    RADII_KEYS,
    isCssLength,
    readLinks,
    readOptionColors,
    readStringMap,
    readTopBar,
    readVariants,
    setOrRemove,
    writeOptionColors,
    type OptionColorRow,
    type ThemeVariant,
} from '@/lib/site-settings';

const SELECT =
    'border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2';

const FONT_LABELS: Record<string, string> = { heading: 'Headings', body: 'Body text', mono: 'Code' };
const RADII_LABELS: Record<string, string> = { panel: 'Panels and cards', control: 'Buttons and inputs', pill: 'Pills' };
const LAYOUT_LABELS: Record<string, string> = { prose: 'Prose width', wide: 'Wide width', gutter: 'Gutter' };

export default function ThemePage() {
    return (
        <SiteForm
            title="Theme"
            description="Colours, fonts, corner radii and widths for this tenant's site. Contrast problems are flagged here and never block a save."
            requireEntry
        >
            {({ values, set, entry }) => <ThemeEditor key={entry?.id} version={entry?.version} values={values} set={set} />}
        </SiteForm>
    );
}

function ThemeEditor({
    version,
    values,
    set,
}: {
    version?: number;
    values: Record<string, unknown>;
    set: (field: string, value: unknown) => void;
}) {
    const colors = readStringMap(values.Colors) ?? {};
    const fonts = readStringMap(values.Fonts) ?? {};
    const radii = readStringMap(values.Radii) ?? {};
    const layout = readStringMap(values.Layout) ?? {};
    const variants = readVariants(values.Variants) ?? [];
    const [previewVariant, setPreviewVariant] = useState('');
    const previewColors = {
        ...colors,
        ...(variants.find((v) => v.name === previewVariant)?.colors ?? {}),
    };

    return (
        <>
            <Section
                title="Colours"
                description="The theme slots the site reads, then any site colours blocks can refer to by name."
            >
                <Structured field="Colors" label="Colours" value={values.Colors} read={readStringMap} onChange={(v) => set('Colors', v)}>
                    {(map) => <ColourMap map={map} onChange={(next) => set('Colors', next)} />}
                </Structured>
            </Section>

            <Section title="Preview" description="A sample of the site in these colours, fonts and radii, before anything is saved.">
                {variants.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Label htmlFor="preview-variant">Preview as</Label>
                        <select
                            id="preview-variant"
                            className={SELECT}
                            value={previewVariant}
                            onChange={(e) => setPreviewVariant(e.target.value)}
                        >
                            <option value="">The default theme</option>
                            {variants.map((v, i) => (
                                <option key={i} value={v.name}>
                                    {v.label || v.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <ThemePreview
                    colors={previewColors}
                    fonts={fonts}
                    radii={radii}
                    layout={layout}
                    name={typeof values.Name === 'string' ? values.Name : ''}
                    tagline={typeof values.Tagline === 'string' ? values.Tagline : ''}
                    links={readLinks(values.HeaderLinks) ?? []}
                    topBar={readTopBar(values.TopBar)?.text ?? ''}
                />
            </Section>

            <Section title="Contrast" description={`Each text colour against the background it sits on. WCAG AA asks for ${AA_NORMAL}:1 for body-size text.`}>
                <ContrastReport colors={colors} />
            </Section>

            <Section title="Fonts" description="Family names as Google Fonts spells them. The site loads them and adds a fallback.">
                <Structured field="Fonts" label="Fonts" value={values.Fonts} read={readStringMap} onChange={(v) => set('Fonts', v)}>
                    {(map) => (
                        <div className="space-y-4">
                            {FONT_ROLES.map((role) => (
                                <div key={role} className="space-y-1">
                                    <TextField
                                        id={`font-${role}`}
                                        label={FONT_LABELS[role]}
                                        placeholder={role === 'mono' ? 'JetBrains Mono' : role === 'heading' ? 'Zilla Slab' : 'Open Sans'}
                                        value={map[role] ?? ''}
                                        onChange={(v) => set('Fonts', setOrRemove(map, role, v))}
                                    />
                                    {map[role] && (
                                        <p className="text-muted-foreground text-sm" style={{ fontFamily: `"${map[role].replace(/"/g, '')}", system-ui` }}>
                                            The quick brown fox jumps over the lazy dog.
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Structured>
            </Section>

            <Section title="Corner radii and widths" description="CSS lengths, such as 2px, 999px or 680px.">
                <Structured field="Radii" label="Corner radii" value={values.Radii} read={readStringMap} onChange={(v) => set('Radii', v)}>
                    {(map) => (
                        <LengthFields keys={RADII_KEYS} labels={RADII_LABELS} map={map} prefix="radius" onChange={(next) => set('Radii', next)} />
                    )}
                </Structured>
                <Structured field="Layout" label="Widths" value={values.Layout} read={readStringMap} onChange={(v) => set('Layout', v)}>
                    {(map) => (
                        <LengthFields keys={LAYOUT_KEYS} labels={LAYOUT_LABELS} map={map} prefix="layout" onChange={(next) => set('Layout', next)} />
                    )}
                </Structured>
            </Section>

            <Section title="Visitor theme variants" description="Themes a visitor can switch between. Each one overrides colours only.">
                <Structured field="Variants" label="Variants" value={values.Variants} read={readVariants} onChange={(v) => set('Variants', v)}>
                    {(list) => <Variants variants={list} base={colors} onChange={(next) => set('Variants', next)} />}
                </Structured>
            </Section>

            <Section title="Colours per option" description="A colour for each option of a choice field, named from the colours above.">
                <Structured
                    field="OptionColors"
                    label="Colours per option"
                    value={values.OptionColors}
                    read={readOptionColors}
                    onChange={(v) => set('OptionColors', v)}
                >
                    {(rows) => (
                        // Keyed on the version: the rows are held here, so a newer stored value has to
                        // start them again or a later commit would drop what it added.
                        <OptionColors key={version} initial={rows} colorNames={Object.keys(colors)} onChange={(next) => set('OptionColors', next)} />
                    )}
                </Structured>
            </Section>
        </>
    );
}

function ColourMap({ map, onChange }: { map: Record<string, string>; onChange: (map: Record<string, string>) => void }) {
    const base = useId();
    const [newName, setNewName] = useState('');
    const custom = Object.keys(map).filter((name) => !(COLOR_SLOTS as readonly string[]).includes(name));
    const nameTaken = newName.trim() !== '' && newName.trim() in map;

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                {COLOR_SLOTS.map((slot) => (
                    <ColourInput
                        key={slot}
                        id={`${base}-${slot}`}
                        label={slot}
                        value={map[slot] ?? ''}
                        onChange={(v) => onChange(setOrRemove(map, slot, v))}
                    />
                ))}
            </div>

            <div className="space-y-2">
                <h3 className="text-sm font-medium">Site colours</h3>
                {custom.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
                {custom.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                        <div className="flex-1">
                            <ColourInput id={`${base}-custom-${name}`} label={name} value={map[name]} onChange={(v) => onChange({ ...map, [name]: v })} />
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${name}`}
                            onClick={() => onChange(setOrRemove(map, name, ''))}
                        >
                            <IconTrash />
                        </Button>
                    </div>
                ))}
                <div className="flex items-end gap-2">
                    <div className="space-y-1">
                        <Label htmlFor={`${base}-new`} className="text-xs">
                            New colour name
                        </Label>
                        <Input
                            id={`${base}-new`}
                            value={newName}
                            placeholder="gold"
                            aria-invalid={nameTaken ? true : undefined}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={newName.trim() === '' || nameTaken}
                        onClick={() => {
                            onChange({ ...map, [newName.trim()]: '#000000' });
                            setNewName('');
                        }}
                    >
                        <IconPlus />
                        Add colour
                    </Button>
                </div>
                {nameTaken && <p className="text-warning text-xs">A colour with that name exists already.</p>}
            </div>
        </div>
    );
}

function Verdict({ result }: { result: ContrastResult }) {
    switch (result.verdict) {
        case 'pass':
            return <StatusBadge tone="success">{formatRatio(result.ratio!)} passes AA</StatusBadge>;
        case 'below':
            return <StatusBadge tone="destructive">{formatRatio(result.ratio!)} below AA</StatusBadge>;
        case 'unreadable':
            return <StatusBadge tone="warning">Not a hex colour</StatusBadge>;
        default:
            return <StatusBadge tone="muted">Not set</StatusBadge>;
    }
}

function ContrastRows({ results }: { results: readonly ContrastResult[] }) {
    return (
        <ul className="divide-y rounded-lg border">
            {results.map((r) => (
                <li key={r.label} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                        {r.label} <span className="text-muted-foreground font-mono text-xs">({r.foreground} on {r.background})</span>
                    </span>
                    <Verdict result={r} />
                </li>
            ))}
        </ul>
    );
}

function ContrastReport({ colors }: { colors: Record<string, string> }) {
    const results = checkContrast(colors);
    const names = Object.keys(colors).filter((n) => !(COLOR_SLOTS as readonly string[]).includes(n));
    const backgrounds = Object.keys(colors);
    const [background, setBackground] = useState('pageBg');
    const againstBg = backgrounds.includes(background) ? background : backgrounds[0] ?? 'pageBg';
    const custom = checkAgainst(colors, names, againstBg);
    const below = countBelow(results) + countBelow(custom);

    return (
        <div className="space-y-4">
            <p
                role="status"
                data-testid="contrast-summary"
                className={below > 0 ? 'text-destructive text-sm font-semibold' : 'text-muted-foreground text-sm'}
            >
                {below === 0
                    ? 'No pair is below AA.'
                    : `${below} ${below === 1 ? 'pair is' : 'pairs are'} below AA. You can still save.`}
            </p>
            <ContrastRows results={results} />
            {names.length > 0 && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor="contrast-background">Site colours against</Label>
                        <select
                            id="contrast-background"
                            className={SELECT}
                            value={againstBg}
                            onChange={(e) => setBackground(e.target.value)}
                        >
                            {backgrounds.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <ContrastRows results={custom} />
                </div>
            )}
        </div>
    );
}

function LengthFields({
    keys,
    labels,
    map,
    prefix,
    onChange,
}: {
    keys: readonly string[];
    labels: Record<string, string>;
    map: Record<string, string>;
    prefix: string;
    onChange: (map: Record<string, string>) => void;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {keys.map((key) => (
                <TextField
                    key={key}
                    id={`${prefix}-${key}`}
                    label={labels[key]}
                    value={map[key] ?? ''}
                    problem={map[key] && !isCssLength(map[key]) ? 'Not a CSS length. The site uses its default.' : null}
                    onChange={(v) => onChange(setOrRemove(map, key, v.trim()))}
                />
            ))}
        </div>
    );
}

function Variants({
    variants,
    base,
    onChange,
}: {
    variants: readonly ThemeVariant[];
    base: Record<string, string>;
    onChange: (variants: ThemeVariant[]) => void;
}) {
    const id = useId();
    const update = (index: number, variant: ThemeVariant) => onChange(variants.map((v, i) => (i === index ? variant : v)));
    const names = Array.from(new Set([...COLOR_SLOTS, ...Object.keys(base)]));

    return (
        <div className="space-y-3">
            {variants.length === 0 && <p className="text-muted-foreground text-sm">No variants. Visitors see the default theme.</p>}
            {variants.map((variant, index) => {
                const below = countBelow(checkContrast({ ...base, ...variant.colors }));
                const unused = names.filter((n) => !(n in variant.colors));
                return (
                    <div key={index} className="space-y-3 rounded-lg border p-4">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1">
                                <TextField
                                    id={`${id}-${index}-name`}
                                    label={`Variant ${index + 1} name`}
                                    placeholder="pine"
                                    value={variant.name}
                                    onChange={(name) => update(index, { ...variant, name })}
                                />
                            </div>
                            <div className="flex-1">
                                <TextField
                                    id={`${id}-${index}-label`}
                                    label={`Variant ${index + 1} label`}
                                    placeholder="Pine"
                                    value={variant.label}
                                    onChange={(label) => update(index, { ...variant, label })}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove variant ${index + 1}`}
                                onClick={() => onChange(variants.filter((_, i) => i !== index))}
                            >
                                <IconTrash />
                            </Button>
                        </div>
                        <p className={below > 0 ? 'text-destructive text-xs font-semibold' : 'text-muted-foreground text-xs'}>
                            {below === 0 ? 'No theme pair is below AA in this variant.' : `${below} theme ${below === 1 ? 'pair is' : 'pairs are'} below AA in this variant.`}
                        </p>
                        {Object.entries(variant.colors).map(([name, value]) => (
                            <div key={name} className="flex items-center gap-2">
                                <div className="flex-1">
                                    <ColourInput
                                        id={`${id}-${index}-${name}`}
                                        label={name}
                                        value={value}
                                        onChange={(v) => update(index, { ...variant, colors: { ...variant.colors, [name]: v } })}
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove ${name} from variant ${index + 1}`}
                                    onClick={() => update(index, { ...variant, colors: setOrRemove(variant.colors, name, '') })}
                                >
                                    <IconTrash />
                                </Button>
                            </div>
                        ))}
                        {unused.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`${id}-${index}-add`} className="text-xs">
                                    Override a colour
                                </Label>
                                <select
                                    id={`${id}-${index}-add`}
                                    className={SELECT}
                                    value=""
                                    onChange={(e) => {
                                        const name = e.target.value;
                                        if (!name) return;
                                        update(index, { ...variant, colors: { ...variant.colors, [name]: base[name] ?? '#000000' } });
                                    }}
                                >
                                    <option value="">Choose a colour</option>
                                    {unused.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...variants, { name: '', label: '', colors: {} }])}>
                <IconPlus />
                Add variant
            </Button>
        </div>
    );
}

/**
 * Rows held here rather than read back from the stored object, because a row still being typed has
 * no field or option yet, and the stored shape has nowhere to keep it.
 */
function OptionColors({
    initial,
    colorNames,
    onChange,
}: {
    initial: readonly OptionColorRow[];
    colorNames: readonly string[];
    onChange: (value: Record<string, Record<string, string>>) => void;
}) {
    const id = useId();
    const [rows, setRows] = useState<OptionColorRow[]>(() => [...initial]);
    const commit = (next: OptionColorRow[]) => {
        setRows(next);
        onChange(writeOptionColors(next));
    };
    const update = (index: number, row: OptionColorRow) => commit(rows.map((r, i) => (i === index ? row : r)));

    return (
        <div className="space-y-2">
            {rows.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
            <datalist id={`${id}-colours`}>
                {colorNames.map((n) => (
                    <option key={n} value={n}>
                        {n}
                    </option>
                ))}
            </datalist>
            {rows.map((row, index) => {
                const unknown = row.color !== '' && !colorNames.includes(row.color);
                return (
                    <div key={index} className="space-y-1 rounded-lg border p-3">
                        <div className="flex flex-wrap items-end gap-2">
                            {(['field', 'option'] as const).map((key) => (
                                <div key={key} className="min-w-40 flex-1 space-y-1">
                                    <Label htmlFor={`${id}-${index}-${key}`} className="text-xs">
                                        {key === 'field' ? `Field ${index + 1}` : `Option ${index + 1}`}
                                    </Label>
                                    <Input
                                        id={`${id}-${index}-${key}`}
                                        value={row[key]}
                                        placeholder={key === 'field' ? 'project.AreaOfFocus' : 'Providing clean water'}
                                        onChange={(e) => update(index, { ...row, [key]: e.target.value })}
                                    />
                                </div>
                            ))}
                            <div className="w-36 space-y-1">
                                <Label htmlFor={`${id}-${index}-color`} className="text-xs">
                                    Colour {index + 1}
                                </Label>
                                <Input
                                    id={`${id}-${index}-color`}
                                    list={`${id}-colours`}
                                    value={row.color}
                                    placeholder="gold"
                                    onChange={(e) => update(index, { ...row, color: e.target.value })}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove option colour ${index + 1}`}
                                onClick={() => commit(rows.filter((_, i) => i !== index))}
                            >
                                <IconTrash />
                            </Button>
                        </div>
                        {unknown && <p className="text-warning text-xs">No colour named {row.color} is defined above.</p>}
                        {(row.field.trim() === '' || row.option.trim() === '') && (
                            <p className="text-muted-foreground text-xs">Not saved until both the field and the option are filled in.</p>
                        )}
                    </div>
                );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { field: '', option: '', color: '' }])}>
                <IconPlus />
                Add option colour
            </Button>
        </div>
    );
}
