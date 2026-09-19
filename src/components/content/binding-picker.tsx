'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconDatabase, IconTimes, IconWarning } from '@/components/icons';
import { bindingText, fallbackProblem, pathProblem, readBindings } from '@/lib/bindings';
import { bindingProblems, type BindingScope } from '@/lib/binding-scopes';

/** The path option that means "not one of these". Not a path, so it can never be a field name. */
const OTHER = '* other *';

const selectClass = 'border-input bg-background w-full rounded-md border px-3 py-2 text-sm';

/**
 * The control that puts a `{{scope.Path}}` into a block prop without anybody typing braces.
 *
 * A person picks where the value comes from and which field, and the placeholder is built for them.
 * That is the whole point: a site is configuration, and the person configuring it is not the person
 * who built it. Typing the syntax is still possible, because the prop is an ordinary text box, but
 * nothing about this asks anybody to know it.
 */
export function BindingControl({
    fieldLabel,
    scopes,
    formats,
    value,
    onChange,
}: {
    fieldLabel: string;
    scopes: BindingScope[];
    formats: string[];
    value: unknown;
    onChange: (value: string) => void;
}) {
    const ids = useId();
    const [open, setOpen] = useState(false);
    const [scopeName, setScopeName] = useState(scopes[0]?.name ?? '');
    const [picked, setPicked] = useState('');
    const [typed, setTyped] = useState('');
    const [format, setFormat] = useState(formats[0] ?? 'text');
    const [fallback, setFallback] = useState('');

    const scope = scopes.find((s) => s.name === scopeName) ?? scopes[0];
    const free = scope?.paths === null || picked === OTHER;
    const path = free ? typed : picked;

    const problems = bindingProblems(value, scopes);
    const bindings = readBindings(value);

    const badPath = pathProblem(path);
    const badFallback = fallbackProblem(fallback);
    const preview = badPath || !scope ? '' : bindingText({ scope: scope.name, path, format, fallback });

    const insert = () => {
        if (!preview || badFallback) return;
        onChange(`${typeof value === 'string' ? value : ''}${preview}`);
        setOpen(false);
        setPicked('');
        setTyped('');
        setFallback('');
    };

    const remove = (raw: string) => {
        if (typeof value !== 'string') return;
        onChange(value.split(raw).join(''));
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-expanded={open}
                    aria-label={`Use data in ${fieldLabel}`}
                    onClick={() => setOpen(!open)}
                >
                    <IconDatabase className="size-3.5" />
                    Use data
                </Button>
                {bindings.map((binding, i) => (
                    <span
                        key={`${i}-${binding.raw}`}
                        className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
                    >
                        {binding.raw}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${binding.raw} from ${fieldLabel}`}
                            onClick={() => remove(binding.raw)}
                        >
                            <IconTimes className="size-3" />
                        </Button>
                    </span>
                ))}
            </div>

            {problems.map((problem, i) => (
                <p key={`${i}-${problem.binding}`} className="text-warning flex items-start gap-1 text-xs">
                    <IconWarning className="mt-0.5 size-3.5 shrink-0" />
                    {problem.message}
                </p>
            ))}

            {open && scope && (
                <div role="group" aria-label={`Data for ${fieldLabel}`} className="space-y-3 rounded-lg border p-3">
                    <div className="space-y-1">
                        <Label htmlFor={`${ids}-scope`}>Where from</Label>
                        <select
                            id={`${ids}-scope`}
                            className={selectClass}
                            value={scope.name}
                            onChange={(e) => {
                                setScopeName(e.target.value);
                                setPicked('');
                                setTyped('');
                            }}
                        >
                            {scopes.map((s) => (
                                <option key={s.name} value={s.name}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-muted-foreground text-xs">{scope.hint}</p>
                        {scope.unavailable && <p className="text-warning text-xs">{scope.unavailable}</p>}
                        {scope.perVisitor && (
                            <p className="text-warning text-xs">
                                The page is then built for each visitor and is not cached.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor={`${ids}-path`}>Which field</Label>
                        {scope.paths === null ? (
                            <Input
                                id={`${ids}-path`}
                                value={typed}
                                placeholder="class"
                                onChange={(e) => setTyped(e.target.value)}
                            />
                        ) : (
                            <select
                                id={`${ids}-path`}
                                className={selectClass}
                                value={picked}
                                onChange={(e) => setPicked(e.target.value)}
                            >
                                <option value="">Choose a field</option>
                                {scope.paths.map((p) => (
                                    <option key={p.path} value={p.path}>
                                        {p.label === p.path ? p.path : `${p.label} (${p.path})`}
                                    </option>
                                ))}
                                <option value={OTHER}>Something else, typed</option>
                            </select>
                        )}
                        {picked === OTHER && (
                            <Input
                                aria-label={`Field name for ${fieldLabel}`}
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                            />
                        )}
                        {path !== '' && badPath && <p className="text-destructive text-xs">{badPath}</p>}
                    </div>

                    {formats.length > 1 && (
                        <div className="space-y-1">
                            <Label htmlFor={`${ids}-format`}>Shown as</Label>
                            <select
                                id={`${ids}-format`}
                                className={selectClass}
                                value={format}
                                onChange={(e) => setFormat(e.target.value)}
                            >
                                {formats.map((f) => (
                                    <option key={f} value={f}>
                                        {f}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1">
                        <Label htmlFor={`${ids}-fallback`}>Show this when there is nothing</Label>
                        <Input
                            id={`${ids}-fallback`}
                            value={fallback}
                            onChange={(e) => setFallback(e.target.value)}
                        />
                        {badFallback && <p className="text-destructive text-xs">{badFallback}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" disabled={!preview || badFallback !== null} onClick={insert}>
                            Insert
                        </Button>
                        <code className="text-muted-foreground font-mono text-xs break-all">{preview}</code>
                    </div>
                </div>
            )}
        </div>
    );
}
