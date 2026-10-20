'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { lifecycleProblems, transitionsUsing } from '@/lib/lifecycle';
import type { LifecycleDefinition } from '@/types/schema';
import { LifecycleDiagram } from './lifecycle-diagram';

/**
 * A type's own states, the one a new entry starts in, and the named moves between them.
 *
 * Controlled: the parent holds the lifecycle and sends `lifecycleToSend(value)` (null when empty, so
 * the type keeps Draft, Published and Archived). Problems are the API's own rules, shown as you type.
 */
export function LifecycleEditor({
    value,
    onChange,
}: {
    value: LifecycleDefinition;
    onChange: (next: LifecycleDefinition) => void;
}) {
    const [newState, setNewState] = useState('');
    const [refusal, setRefusal] = useState<string | null>(null);
    const problems = lifecycleProblems(value);
    const { states, transitions } = value;

    const addState = () => {
        const name = newState.trim();
        if (!name) return;
        setRefusal(null);
        onChange({
            ...value,
            states: [...states, name],
            initialState: value.initialState || name,
        });
        setNewState('');
    };

    const removeState = (state: string) => {
        const used = transitionsUsing(value, state);
        if (used.length > 0) {
            setRefusal(`State ${state} is used by ${used.join(', ')}. Remove the transition first.`);
            return;
        }
        setRefusal(null);
        const rest = states.filter((s) => s !== state);
        onChange({
            ...value,
            states: rest,
            initialState: value.initialState === state ? (rest[0] ?? '') : value.initialState,
        });
    };

    const moveState = (i: number, by: -1 | 1) => {
        const next = [...states];
        const j = i + by;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange({ ...value, states: next });
    };

    const renameState = (i: number, name: string) => {
        const old = states[i];
        onChange({
            states: states.map((s, k) => (k === i ? name : s)),
            initialState: value.initialState === old ? name : value.initialState,
            transitions: transitions.map((t) => ({
                ...t,
                from: t.from === old ? name : t.from,
                to: t.to === old ? name : t.to,
            })),
        });
    };

    const setTransition = (i: number, patch: Partial<LifecycleDefinition['transitions'][number]>) =>
        onChange({ ...value, transitions: transitions.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

    return (
        <section aria-labelledby="lifecycle-heading" className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
                <h2 id="lifecycle-heading" className="text-sm font-medium">
                    Lifecycle
                </h2>
                <p className="text-muted-foreground text-sm">
                    Leave this empty and entries stay Draft, Published or Archived. Declare states to give
                    this type its own, such as Recorded, Approved and Rejected.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="lifecycle-new-state">States, in order</Label>
                        <ul className="space-y-1">
                            {states.map((state, i) => (
                                <li key={i} className="flex items-center gap-1">
                                    <Input
                                        aria-label={`State ${i + 1}`}
                                        value={state}
                                        className="font-mono"
                                        onChange={(e) => renameState(i, e.target.value.trim())}
                                    />
                                    <Button type="button" variant="ghost" size="sm" aria-label={`Move ${state} up`} disabled={i === 0} onClick={() => moveState(i, -1)}>
                                        Up
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" aria-label={`Move ${state} down`} disabled={i === states.length - 1} onClick={() => moveState(i, 1)}>
                                        Down
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" aria-label={`Remove state ${state}`} onClick={() => removeState(state)}>
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <Input
                                id="lifecycle-new-state"
                                value={newState}
                                placeholder="Recorded"
                                className="font-mono"
                                onChange={(e) => setNewState(e.target.value.trim())}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addState();
                                    }
                                }}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={addState}>
                                Add state
                            </Button>
                        </div>
                    </div>

                    {states.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="lifecycle-initial">New entries start in</Label>
                            <Select
                                value={value.initialState}
                                onValueChange={(initialState) => onChange({ ...value, initialState })}
                            >
                                <SelectTrigger id="lifecycle-initial" aria-label="Initial state">
                                    <SelectValue placeholder="Pick a state" />
                                </SelectTrigger>
                                <SelectContent>
                                    {states.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {s}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Transitions</Label>
                        <ul className="space-y-2">
                            {transitions.map((t, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-1">
                                    <Input
                                        aria-label={`Transition ${i + 1} name`}
                                        value={t.name}
                                        placeholder="Approve"
                                        className="w-32 font-mono"
                                        onChange={(e) => setTransition(i, { name: e.target.value.trim() })}
                                    />
                                    <Select value={t.from} onValueChange={(from) => setTransition(i, { from })}>
                                        <SelectTrigger aria-label={`Transition ${i + 1} from`} className="w-32">
                                            <SelectValue placeholder="From" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {states.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    {s}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={t.to} onValueChange={(to) => setTransition(i, { to })}>
                                        <SelectTrigger aria-label={`Transition ${i + 1} to`} className="w-32">
                                            <SelectValue placeholder="To" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {states.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    {s}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-label={`Remove transition ${t.name || i + 1}`}
                                        onClick={() => {
                                            setRefusal(null);
                                            onChange({ ...value, transitions: transitions.filter((_, k) => k !== i) });
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                onChange({ ...value, transitions: [...transitions, { name: '', from: '', to: '' }] })
                            }
                        >
                            Add transition
                        </Button>
                    </div>
                </div>

                <div aria-label="Lifecycle diagram" className="min-w-0">
                    <LifecycleDiagram lifecycle={value} />
                </div>
            </div>

            {refusal && (
                <p role="alert" className="text-destructive text-sm">
                    {refusal}
                </p>
            )}
            {problems.length > 0 && (
                <ul role="alert" aria-label="Lifecycle problems" className="text-destructive list-disc space-y-1 pl-5 text-sm">
                    {problems.map((p) => (
                        <li key={p}>{p}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}
