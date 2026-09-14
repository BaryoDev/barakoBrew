import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DynamicForm } from './dynamic-form';
import type { FieldDefinition } from '@/types/schema';

const RACES = [
    { value: 'FUN', label: 'Fun run' },
    { value: 'COMPETE', label: 'Competitive' },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((v) => ({ value: v, label: `Size ${v}` }));

/** A form that keeps its own values, and exposes the last one it was handed. */
function Harness({
    field,
    initial,
    report,
}: {
    field: FieldDefinition;
    initial: Record<string, unknown>;
    report: (values: Record<string, unknown>) => void;
}) {
    const [values, setValues] = useState(initial);
    return (
        <DynamicForm
            fields={[field]}
            values={values}
            onChange={(next) => {
                report(next);
                setValues(next);
            }}
        />
    );
}

function renderChoice(field: Partial<FieldDefinition>, initial: Record<string, unknown> = {}) {
    const seen = { values: initial };
    const definition = {
        name: 'EntryType',
        displayName: 'Entry type',
        type: 'choice',
        isRequired: false,
        options: RACES,
        multiple: false,
        ...field,
    } as FieldDefinition;
    render(
        <Harness
            field={definition}
            initial={initial}
            report={(values) => {
                seen.values = values;
            }}
        />,
    );
    return seen;
}

describe('a single choice', () => {
    it('shows labels and saves the value', () => {
        const seen = renderChoice({});

        expect(screen.getAllByRole('radio')).toHaveLength(2);
        fireEvent.click(screen.getByLabelText('Competitive'));

        expect(seen.values).toEqual({ EntryType: 'COMPETE' });
    });

    it('is a select once it has more than five options', () => {
        const seen = renderChoice({ name: 'Size', displayName: 'Size', options: SIZES });

        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        const select = screen.getByLabelText('Size') as HTMLSelectElement;
        expect(select.tagName).toBe('SELECT');
        fireEvent.change(select, { target: { value: 'XL' } });

        expect(seen.values).toEqual({ Size: 'XL' });
    });

    it('omits an optional value when cleared, rather than sending an empty string', () => {
        const seen = renderChoice({}, { EntryType: 'FUN', Title: 'kept' });

        fireEvent.click(screen.getByRole('button', { name: 'Clear Entry type' }));

        expect(seen.values).toEqual({ Title: 'kept' });
        expect('EntryType' in seen.values).toBe(false);
    });

    it('omits an optional value cleared from the select', () => {
        const seen = renderChoice({ name: 'Size', displayName: 'Size', options: SIZES }, { Size: 'M' });

        fireEvent.change(screen.getByLabelText('Size'), { target: { value: '' } });

        expect('Size' in seen.values).toBe(false);
    });

    it('offers no clear on a required choice', () => {
        renderChoice({ isRequired: true }, { EntryType: 'FUN' });

        expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('marks a stored value that is no longer offered', () => {
        renderChoice({}, { EntryType: 'WALK' });

        expect(screen.getByLabelText('WALK (not offered any more)')).toBeChecked();
        expect(screen.getByText('"WALK" is not offered any more. Pick another value before saving.')).toBeInTheDocument();
    });

    it('does not treat a value differing only in case as offered', () => {
        // Values match exactly on the API, so "fun" is not "FUN".
        renderChoice({}, { EntryType: 'fun' });

        expect(screen.getByText(/"fun" is not offered any more/)).toBeInTheDocument();
    });
});

describe('a multiple choice', () => {
    const field = {
        name: 'Sizes',
        displayName: 'Sizes',
        options: SIZES.slice(0, 4),
        multiple: true,
    };

    it('is checkboxes, and saves a list in the order of the options', () => {
        const seen = renderChoice(field);

        expect(screen.getAllByRole('checkbox')).toHaveLength(4);
        fireEvent.click(screen.getByLabelText('Size L'));
        fireEvent.click(screen.getByLabelText('Size XS'));

        expect(seen.values).toEqual({ Sizes: ['XS', 'L'] });
    });

    it('drops a value when it is unchecked', () => {
        const seen = renderChoice(field, { Sizes: ['S', 'M'] });

        fireEvent.click(screen.getByLabelText('Size S'));

        expect(seen.values).toEqual({ Sizes: ['M'] });
    });

    it('marks a stored value that is no longer offered, and lets it be unchecked', () => {
        const seen = renderChoice(field, { Sizes: ['S', 'XXL'] });

        const stale = screen.getByLabelText('XXL (not offered any more)');
        expect(stale).toBeChecked();
        expect(screen.getByText(/"XXL" is not offered any more/)).toBeInTheDocument();

        fireEvent.click(stale);

        expect(seen.values).toEqual({ Sizes: ['S'] });
        expect(screen.queryByText(/not offered any more/)).not.toBeInTheDocument();
    });
});
