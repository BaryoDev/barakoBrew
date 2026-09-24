'use client';

import { useId, useState } from 'react';
import { FieldError } from '@/components/content/field-error';
import { FALLBACK } from '@/components/site/theme-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPlus, IconTrash } from '@/components/icons';
import { contrastRatio, formatRatio, toLongHex } from '@/lib/contrast';
import {
    COLOR,
    MAX_TOKENS,
    MAX_TONES,
    THEME_COLOR_NAMES,
    TONE_PARTS,
    repeatedNames,
    resolveToneColour,
    tokenKind,
    tokenNameProblem,
    tokenValueProblem,
    toneColourProblem,
    toneNameProblem,
    writeTokens,
    writeTones,
    type TokenKind,
    type TokenRow,
    type ToneRow,
} from '@/lib/theme-tokens';

const KIND_LABELS: Record<TokenKind, string> = { colour: 'Colour', length: 'Length', font: 'Font stack' };
const PART_LABELS: Record<(typeof TONE_PARTS)[number], string> = { ink: 'Ink', bg: 'Background', edge: 'Edge' };

function TokenSample({ kind, value }: { kind: TokenKind | null; value: string }) {
    if (kind === 'colour') {
        return <span aria-hidden className="size-6 shrink-0 rounded-md border" style={{ background: value.trim() }} />;
    }
    if (kind === 'length') {
        return (
            <span aria-hidden className="bg-muted block h-6 w-24 shrink-0 overflow-hidden rounded-md border">
                <span className="bg-primary/60 block h-full max-w-full" style={{ width: value.trim() }} />
            </span>
        );
    }
    if (kind === 'font') {
        return (
            <span aria-hidden className="w-24 shrink-0 truncate text-sm" style={{ fontFamily: value.trim() }}>
                Aa Bb Cc
            </span>
        );
    }
    return <span aria-hidden className="w-6 shrink-0" />;
}

/**
 * Named colours, lengths and font stacks, emitted by the site as `--t-<name>`.
 *
 * Rows are held here rather than read back from the stored map, because a row still being named has
 * nowhere to live in it, and two rows briefly sharing a name would collapse into one.
 */
export function TokensEditor({
    initial,
    onChange,
}: {
    initial: readonly TokenRow[];
    onChange: (value: Record<string, string>) => void;
}) {
    const id = useId();
    const [rows, setRows] = useState<TokenRow[]>(() => [...initial]);
    const commit = (next: TokenRow[]) => {
        setRows(next);
        onChange(writeTokens(next));
    };
    const update = (index: number, row: TokenRow) => commit(rows.map((r, i) => (i === index ? row : r)));
    const repeated = repeatedNames(rows.map((r) => r.name));

    return (
        <div className="space-y-2">
            {rows.length === 0 && <p className="text-muted-foreground text-sm">No tokens yet.</p>}
            {rows.map((row, index) => {
                const kind = tokenKind(row.value);
                const hex = kind === 'colour' ? toLongHex(row.value.trim()) : null;
                const nameProblem = row.name.trim() === '' ? null : tokenNameProblem(row.name);
                const valueProblem = row.name.trim() === '' ? null : tokenValueProblem(row.value);
                return (
                    <div key={index} className="space-y-1 rounded-lg border p-3" data-testid="token-row">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="w-44 space-y-1">
                                <Label htmlFor={`${id}-${index}-name`} className="text-xs">
                                    Token {index + 1} name
                                </Label>
                                <Input
                                    id={`${id}-${index}-name`}
                                    value={row.name}
                                    placeholder="cms-ink"
                                    spellCheck={false}
                                    aria-invalid={nameProblem || repeated.has(index) ? true : undefined}
                                    className="font-mono text-xs"
                                    onChange={(e) => update(index, { ...row, name: e.target.value })}
                                />
                            </div>
                            <div className="min-w-48 flex-1 space-y-1">
                                <Label htmlFor={`${id}-${index}-value`} className="text-xs">
                                    Token {index + 1} value
                                </Label>
                                <div className="flex items-center gap-2">
                                    {hex !== null && (
                                        <input
                                            type="color"
                                            aria-label={`Token ${index + 1} colour picker`}
                                            value={hex}
                                            onChange={(e) => update(index, { ...row, value: e.target.value })}
                                            className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                                        />
                                    )}
                                    <Input
                                        id={`${id}-${index}-value`}
                                        value={row.value}
                                        placeholder="#1D3A8A, 24px or 'Zilla Slab', Georgia, serif"
                                        spellCheck={false}
                                        aria-invalid={valueProblem ? true : undefined}
                                        className="font-mono text-xs"
                                        onChange={(e) => update(index, { ...row, value: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex h-9 items-center gap-2">
                                <TokenSample kind={kind} value={row.value} />
                                <span className="text-muted-foreground w-20 text-xs">{kind ? KIND_LABELS[kind] : ''}</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove token ${index + 1}`}
                                    onClick={() => commit(rows.filter((_, i) => i !== index))}
                                >
                                    <IconTrash />
                                </Button>
                            </div>
                        </div>
                        <FieldError message={nameProblem ?? undefined} />
                        <FieldError message={valueProblem ?? undefined} />
                        {repeated.has(index) && (
                            <p className="text-warning text-xs">A token above has this name, so this one is not saved.</p>
                        )}
                        {row.name.trim() === '' && <p className="text-muted-foreground text-xs">Not saved until it has a name.</p>}
                    </div>
                );
            })}
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= MAX_TOKENS}
                onClick={() => setRows([...rows, { name: '', value: '' }])}
            >
                <IconPlus />
                Add token
            </Button>
        </div>
    );
}

function ToneChip({ row, tokens, colors }: { row: ToneRow; tokens: Record<string, string>; colors: Record<string, string> }) {
    const fallback = (slot: string) => FALLBACK[slot];
    const ink = resolveToneColour(row.ink, tokens, colors, fallback);
    const bg = resolveToneColour(row.bg, tokens, colors, fallback);
    const edge = resolveToneColour(row.edge, tokens, colors, fallback);
    const ratio = ink && bg ? contrastRatio(ink, bg) : null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span
                data-testid="tone-chip"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                style={{
                    color: ink,
                    background: bg,
                    border: `1px solid ${edge ?? 'transparent'}`,
                }}
            >
                {row.name.trim() || 'tone'}
                <span style={{ borderColor: edge }} className="rounded-full border px-2 text-xs">
                    A sample
                </span>
            </span>
            {ratio !== null && <span className="text-muted-foreground text-xs">Ink on background {formatRatio(ratio)}</span>}
        </div>
    );
}

/**
 * Named tones: an ink, a background and an edge, each a token, a colour slot or a colour written
 * out. A block stores the name the way it stores `accent`.
 */
export function TonesEditor({
    initial,
    tokens,
    colors,
    onChange,
}: {
    initial: readonly ToneRow[];
    /** The tokens the site keeps, which a tone part may name. */
    tokens: Record<string, string>;
    colors: Record<string, string>;
    onChange: (value: Record<string, { ink: string; bg: string; edge: string }>) => void;
}) {
    const id = useId();
    const [rows, setRows] = useState<ToneRow[]>(() => [...initial]);
    const commit = (next: ToneRow[]) => {
        setRows(next);
        onChange(writeTones(next));
    };
    const update = (index: number, row: ToneRow) => commit(rows.map((r, i) => (i === index ? row : r)));
    const repeated = repeatedNames(rows.map((r) => r.name));
    const colourNames = [
        ...Object.keys(tokens).filter((name) => COLOR.test(tokens[name])),
        ...THEME_COLOR_NAMES.filter((name) => !Object.hasOwn(tokens, name)),
    ];

    return (
        <div className="space-y-2">
            <datalist id={`${id}-colours`}>
                {colourNames.map((n) => (
                    <option key={n} value={n}>
                        {n}
                    </option>
                ))}
            </datalist>
            {rows.length === 0 && <p className="text-muted-foreground text-sm">No tones of the site&apos;s own yet.</p>}
            {rows.map((row, index) => {
                const named = row.name.trim() !== '';
                const nameProblem = named ? toneNameProblem(row.name) : null;
                return (
                    <div key={index} className="space-y-2 rounded-lg border p-3" data-testid="tone-row">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="w-36 space-y-1">
                                <Label htmlFor={`${id}-${index}-name`} className="text-xs">
                                    Tone {index + 1} name
                                </Label>
                                <Input
                                    id={`${id}-${index}-name`}
                                    value={row.name}
                                    placeholder="cms"
                                    spellCheck={false}
                                    aria-invalid={nameProblem || repeated.has(index) ? true : undefined}
                                    className="font-mono text-xs"
                                    onChange={(e) => update(index, { ...row, name: e.target.value })}
                                />
                            </div>
                            {TONE_PARTS.map((part) => {
                                const problem = named ? toneColourProblem(row[part], tokens) : null;
                                return (
                                    <div key={part} className="min-w-32 flex-1 space-y-1">
                                        <Label htmlFor={`${id}-${index}-${part}`} className="text-xs">
                                            Tone {index + 1} {PART_LABELS[part].toLowerCase()}
                                        </Label>
                                        <Input
                                            id={`${id}-${index}-${part}`}
                                            list={`${id}-colours`}
                                            value={row[part]}
                                            placeholder={part === 'edge' ? '#B9C8F5' : part === 'ink' ? 'cms-ink' : 'cms-bg'}
                                            spellCheck={false}
                                            aria-invalid={problem ? true : undefined}
                                            className="font-mono text-xs"
                                            onChange={(e) => update(index, { ...row, [part]: e.target.value })}
                                        />
                                    </div>
                                );
                            })}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove tone ${index + 1}`}
                                onClick={() => commit(rows.filter((_, i) => i !== index))}
                            >
                                <IconTrash />
                            </Button>
                        </div>
                        <ToneChip row={row} tokens={tokens} colors={colors} />
                        <FieldError message={nameProblem ?? undefined} />
                        {named &&
                            TONE_PARTS.map((part) => {
                                const problem = toneColourProblem(row[part], tokens);
                                return problem ? <FieldError key={part} message={`${PART_LABELS[part]}: ${problem}`} /> : null;
                            })}
                        {repeated.has(index) && (
                            <p className="text-warning text-xs">A tone above has this name, so this one is not saved.</p>
                        )}
                        {!named && <p className="text-muted-foreground text-xs">Not saved until it has a name.</p>}
                    </div>
                );
            })}
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= MAX_TONES}
                onClick={() => setRows([...rows, { name: '', ink: '', bg: '', edge: '' }])}
            >
                <IconPlus />
                Add tone
            </Button>
        </div>
    );
}
