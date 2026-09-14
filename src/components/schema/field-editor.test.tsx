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

describe('a choice field', () => {
    function startChoice() {
        render(<FieldEditor fields={[]} onChange={() => {}} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Add field' })[0]);
        fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Entry type' } });
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Type' }), { key: 'ArrowDown' });
        const choice = within(screen.getByRole('listbox'))
            .getAllByRole('option')
            .find((o) => o.textContent?.startsWith('Choice'))!;
        fireEvent.keyDown(choice, { key: 'Enter' });
    }

    function addButton() {
        // The dialog's own button, the last of the matches; the list header and empty state come first.
        const buttons = screen.getAllByRole('button', { name: 'Add field' });
        return buttons[buttons.length - 1];
    }

    it('asks for options and whether it holds several', () => {
        startChoice();

        expect(screen.getByRole('switch', { name: 'Holds several values' })).toBeInTheDocument();
        expect(screen.getByLabelText('Value for option 1')).toBeInTheDocument();
    });

    it('flags values that differ only in case before the API refuses them', () => {
        startChoice();

        fireEvent.change(screen.getByLabelText('Value for option 1'), { target: { value: 'FUN' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        fireEvent.change(screen.getByLabelText('Value for option 2'), { target: { value: 'fun' } });

        expect(screen.getByText(/"fun" differs from "FUN" only in case/)).toBeInTheDocument();
        expect(addButton()).toBeDisabled();

        fireEvent.change(screen.getByLabelText('Value for option 2'), { target: { value: 'COMPETE' } });

        expect(screen.queryByText(/only in case/)).not.toBeInTheDocument();
        expect(addButton()).toBeEnabled();
    });

    it('saves the options with the field, and drops them if the type changes away from choice', () => {
        const saved: FieldDefinition[][] = [];
        render(<FieldEditor fields={[]} onChange={(f) => saved.push(f)} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Add field' })[0]);
        fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Kind' } });

        const pick = (label: string) => {
            fireEvent.keyDown(screen.getByRole('combobox', { name: 'Type' }), { key: 'ArrowDown' });
            const option = within(screen.getByRole('listbox'))
                .getAllByRole('option')
                .find((o) => o.textContent?.startsWith(label))!;
            fireEvent.keyDown(option, { key: 'Enter' });
        };

        pick('Choice');
        fireEvent.change(screen.getByLabelText('Value for option 1'), { target: { value: 'A' } });
        pick('Long text');
        const buttons = screen.getAllByRole('button', { name: 'Add field' });
        fireEvent.click(buttons[buttons.length - 1]);

        expect(saved).toHaveLength(1);
        expect(saved[0][0].type).toBe('text');
        expect('options' in saved[0][0]).toBe(false);
        expect('multiple' in saved[0][0]).toBe(false);
    });
});
