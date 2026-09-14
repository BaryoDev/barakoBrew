'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/content/field-error';
import {
    RADIO_GROUP_LIMIT,
    notOfferedMessage,
    notOfferedValues,
    optionLabel,
    storedChoiceValues,
} from '@/lib/choice';
import type { FieldDefinition } from '@/types/schema';

const NOT_OFFERED = '(not offered any more)';

const SELECT =
    'border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] sm:w-72';

/**
 * A choice field: labels shown, values saved.
 *
 * A single choice is a radio group up to five options and a select beyond that; a multiple choice is
 * a list of checkboxes. A stored value the field no longer offers stays visible, marked, so the
 * editor can see what is there and change it. The API refuses to save it.
 */
export function ChoiceField({
    field,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const options = field.options ?? [];
    const held = storedChoiceValues(value);
    const stale = notOfferedValues(field, value);
    const message = error ?? notOfferedMessage(stale);

    const required = field.isRequired && <span className="text-destructive ml-0.5">*</span>;

    if (field.multiple) {
        const toggle = (optionValue: string, checked: boolean) => {
            if (!checked) return onChange(held.filter((v) => v !== optionValue));
            // In the field's order, so the saved list reads the way the options do.
            const next = options.map((o) => o.value).filter((v) => v === optionValue || held.includes(v));
            onChange([...next, ...held.filter((v) => stale.includes(v))]);
        };

        return (
            <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                    {field.displayName}
                    {required}
                </legend>
                <div className="space-y-1.5">
                    {options.map((option, i) => (
                        <CheckRow
                            key={option.value}
                            id={`${field.name}-${i}`}
                            label={optionLabel(option)}
                            checked={held.includes(option.value)}
                            onChange={(checked) => toggle(option.value, checked)}
                        />
                    ))}
                    {stale.map((v, i) => (
                        <CheckRow
                            key={`stale-${v}`}
                            id={`${field.name}-stale-${i}`}
                            label={`${v} ${NOT_OFFERED}`}
                            checked
                            onChange={(checked) => toggle(v, checked)}
                        />
                    ))}
                </div>
                <FieldError message={message} />
            </fieldset>
        );
    }

    const current = held[0] ?? '';
    const clear = () => onChange(undefined);

    if (options.length <= RADIO_GROUP_LIMIT) {
        return (
            <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                    {field.displayName}
                    {required}
                </legend>
                <div className="space-y-1.5">
                    {options.map((option, i) => (
                        <RadioRow
                            key={option.value}
                            id={`${field.name}-${i}`}
                            name={field.name}
                            label={optionLabel(option)}
                            checked={current === option.value}
                            onSelect={() => onChange(option.value)}
                        />
                    ))}
                    {stale.map((v) => (
                        <RadioRow
                            key={`stale-${v}`}
                            id={`${field.name}-stale`}
                            name={field.name}
                            label={`${v} ${NOT_OFFERED}`}
                            checked
                            onSelect={() => {}}
                        />
                    ))}
                </div>
                {!field.isRequired && current !== '' && (
                    <Button type="button" variant="ghost" size="sm" onClick={clear}>
                        Clear {field.displayName}
                    </Button>
                )}
                <FieldError message={message} />
            </fieldset>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={field.name}>
                {field.displayName}
                {required}
            </Label>
            <select
                id={field.name}
                className={SELECT}
                value={current}
                onChange={(e) => (e.target.value === '' ? clear() : onChange(e.target.value))}
            >
                <option value="" disabled={field.isRequired}>
                    {field.isRequired ? 'Choose a value' : 'No value'}
                </option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {optionLabel(option)}
                    </option>
                ))}
                {stale.map((v) => (
                    <option key={`stale-${v}`} value={v} disabled>
                        {v} {NOT_OFFERED}
                    </option>
                ))}
            </select>
            <FieldError message={message} />
        </div>
    );
}

function CheckRow({
    id,
    label,
    checked,
    onChange,
}: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                id={id}
                type="checkbox"
                aria-label={label}
                className="accent-primary size-4"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
        </div>
    );
}

function RadioRow({
    id,
    name,
    label,
    checked,
    onSelect,
}: {
    id: string;
    name: string;
    label: string;
    checked: boolean;
    onSelect: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                id={id}
                type="radio"
                name={name}
                aria-label={label}
                className="accent-primary size-4"
                checked={checked}
                onChange={onSelect}
            />
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
        </div>
    );
}
