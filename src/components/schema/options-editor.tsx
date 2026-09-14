'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconChevronDown, IconPlus, IconTrash } from '@/components/icons';
import { FieldError } from '@/components/content/field-error';
import { MAX_CHOICE_OPTIONS, optionIssues } from '@/lib/choice';
import { cn } from '@/lib/utils';
import type { FieldOption } from '@/types/schema';

/**
 * The ordered options of a choice field: a value and a label each, reordered by dragging a row or
 * with the move buttons, which are the keyboard path.
 */
export function OptionsEditor({
    options,
    onChange,
}: {
    options: FieldOption[];
    onChange: (options: FieldOption[]) => void;
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    const issues = optionIssues(options);

    const update = (index: number, patch: Partial<FieldOption>) =>
        onChange(options.map((option, i) => (i === index ? { ...option, ...patch } : option)));

    // On the handle and the two inputs, which between them cover the row.
    const dropOn = (index: number) => ({
        onDragOver: (e: React.DragEvent) => {
            if (dragging !== null) e.preventDefault();
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragging !== null) move(dragging, index);
            setDragging(null);
        },
    });

    const move = (from: number, to: number) => {
        if (to < 0 || to >= options.length || from === to) return;
        const next = [...options];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(next);
    };

    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
                The value is saved in entries and matched exactly, so keep it stable. The label is what
                editors see and can be reworded any time.
            </p>
            <ol className="space-y-2">
                {options.map((option, index) => (
                    // Position is the identity: two rows can hold the same text while one is being typed.
                    <li key={index}>
                        <div className={cn('flex items-center gap-1.5 rounded-md', dragging === index && 'opacity-50')}>
                            <span
                                draggable
                                onDragStart={() => setDragging(index)}
                                onDragEnd={() => setDragging(null)}
                                {...dropOn(index)}
                                aria-hidden
                                title="Drag to reorder"
                                className="text-muted-foreground cursor-grab px-1 select-none"
                            >
                                ⋮⋮
                            </span>
                            <div className="flex flex-col">
                                <button
                                    type="button"
                                    onClick={() => move(index, index - 1)}
                                    disabled={index === 0}
                                    aria-label={`Move option ${index + 1} up`}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <IconChevronDown className="size-3 rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(index, index + 1)}
                                    disabled={index === options.length - 1}
                                    aria-label={`Move option ${index + 1} down`}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <IconChevronDown className="size-3" />
                                </button>
                            </div>
                            <Input
                                aria-label={`Value for option ${index + 1}`}
                                placeholder="FUN"
                                className="font-mono"
                                value={option.value}
                                aria-invalid={issues.rows[index] !== null}
                                {...dropOn(index)}
                                onChange={(e) => update(index, { value: e.target.value })}
                            />
                            <Input
                                aria-label={`Label for option ${index + 1}`}
                                placeholder="Fun run"
                                value={option.label}
                                {...dropOn(index)}
                                onChange={(e) => update(index, { label: e.target.value })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove option ${index + 1}`}
                                className="text-destructive hover:text-destructive shrink-0"
                                onClick={() => onChange(options.filter((_, i) => i !== index))}
                            >
                                <IconTrash className="size-3.5" />
                            </Button>
                        </div>
                        <FieldError message={issues.rows[index]} />
                    </li>
                ))}
            </ol>
            <FieldError message={issues.list} />
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={options.length >= MAX_CHOICE_OPTIONS}
                onClick={() => onChange([...options, { value: '', label: '' }])}
            >
                <IconPlus className="size-3.5" />
                Add option
            </Button>
        </div>
    );
}
