import { describe, it, expect, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FieldEditor } from './field-editor';
import { FIELD_TYPES, FIELD_TYPE_GROUPS, type FieldDefinition } from '@/types/schema';

// Radix Select drives itself with pointer capture and scrolls the active item into view. jsdom has
// neither, so the picker cannot be opened without these.
beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

function openTypePicker() {
    render(<FieldEditor fields={[]} onChange={() => {}} />);
    // With no fields yet there are two: the header button and the empty state's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add field' })[0]);
    // Radix opens the listbox from the keyboard as well as the pointer, and the keyboard path
    // does not need jsdom to have a pointer.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Type' }), { key: 'ArrowDown' });
}

describe('the type picker', () => {
    it('heads each group with its name, in the design order', () => {
        openTypePicker();
        const listbox = screen.getByRole('listbox');
        // By slot, not by text: 'Text' is both a group and a type, so a text query finds two.
        const headings = within(listbox)
            .getAllByText((_content, el) => el?.getAttribute('data-slot') === 'select-label')
            .map((el) => el.textContent);

        expect(headings).toEqual(FIELD_TYPE_GROUPS.map((g) => g.label));
    });

    it('offers every type, in its group', () => {
        openTypePicker();
        const options = within(screen.getByRole('listbox')).getAllByRole('option');

        expect(options).toHaveLength(FIELD_TYPES.length);
        // FIELD_TYPES is the groups flattened, so option i is the i-th type of the i-th group.
        options.forEach((option, i) => {
            expect(option.textContent, FIELD_TYPES[i].value).toContain(FIELD_TYPES[i].label);
        });
    });

    it('offers the three types the list was short of', () => {
        openTypePicker();
        const options = within(screen.getByRole('listbox'))
            .getAllByRole('option')
            .map((o) => o.textContent ?? '');

        // text, geopoint and reference are in FieldTypeRegistry and were not in FIELD_TYPES.
        expect(options.some((o) => o.startsWith('Long text'))).toBe(true);
        expect(options.some((o) => o.startsWith('Location'))).toBe(true);
        expect(options.some((o) => o.startsWith('Reference'))).toBe(true);
    });
});

describe('a field whose type is an alias', () => {
    // A definition written by hand or by a CLI can say 'integer' where the picker says 'int'. The
    // server accepts it, so it comes back to the editor, and showing the raw word makes a known
    // type look like one this console does not have.
    const ALIASED: FieldDefinition[] = [
        { name: 'Views', displayName: 'Views', type: 'integer', isRequired: false },
        { name: 'Active', displayName: 'Active', type: 'boolean', isRequired: false },
    ];

    it('is listed by the label of the type it aliases', () => {
        render(<FieldEditor fields={ALIASED} onChange={() => {}} />);

        expect(screen.getByText(/Whole number/)).toBeInTheDocument();
        expect(screen.getByText(/Yes \/ No/)).toBeInTheDocument();
        expect(screen.queryByText(/· integer/)).not.toBeInTheDocument();
        expect(screen.queryByText(/· boolean/)).not.toBeInTheDocument();
    });

    it('opens in the editor with its canonical type already chosen', () => {
        render(<FieldEditor fields={ALIASED} onChange={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Views' }));

        expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Whole number');
    });
});
