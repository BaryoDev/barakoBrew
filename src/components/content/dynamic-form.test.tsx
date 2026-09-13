import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicForm } from './dynamic-form';
import type { FieldDefinition } from '@/types/schema';

function renderField(field: Partial<FieldDefinition> & { name: string; type: FieldDefinition['type'] }) {
    render(
        <DynamicForm
            fields={[{ displayName: field.name, isRequired: false, ...field } as FieldDefinition]}
            values={{}}
            onChange={() => {}}
        />,
    );
    return document.getElementById(field.name)!;
}

describe('a field whose type is an alias', () => {
    // The control is picked by the type, so an unresolved alias does not just read wrong, it hands
    // the operator the wrong input: a textarea for a number, free text for a toggle.
    it('gets the control of the type it aliases', () => {
        expect(renderField({ name: 'Views', type: 'integer' })).toHaveAttribute('type', 'number');
        expect(renderField({ name: 'Score', type: 'number' })).toHaveAttribute('type', 'number');
        expect(renderField({ name: 'Active', type: 'boolean' })).toHaveAttribute('role', 'switch');
    });

    it('reads a whole number as a whole number', () => {
        // int steps by 1; decimal and money step by any. An alias for int has to step by 1 too.
        expect(renderField({ name: 'Views', type: 'integer' })).toHaveAttribute('step', '1');
    });
});

describe('the types the picker was short of', () => {
    it('gives long text a textarea', () => {
        expect(renderField({ name: 'Body', type: 'text' }).tagName).toBe('TEXTAREA');
    });

    it('gives a reference with no target type a single-line input, not a textarea', () => {
        // A reference is the id of another entry, and one whose definition does not name the type it
        // points at has nothing to search, so it keeps the id box. A definition that does name one
        // gets the picker, which reference-field.test.tsx covers.
        const control = renderField({ name: 'Author', type: 'reference' });
        expect(control.tagName).toBe('INPUT');
        expect(control).toHaveAttribute('type', 'text');
    });

    it('gives a geopoint the JSON editor, because the server wants an object', () => {
        // FieldTypeRegistry refuses anything but { "lat": number, "lng": number }, so a plain
        // textarea would store a string and the write would be rejected.
        const control = renderField({ name: 'Where', type: 'geopoint' });
        expect(control.tagName).toBe('TEXTAREA');
        expect(screen.getByText(/lat/)).toBeInTheDocument();
    });
});

describe('a type this console has never heard of', () => {
    it('falls back to a plain textarea rather than failing to render', () => {
        // The console can be older than the API. A field it cannot type is still editable.
        expect(renderField({ name: 'Mystery', type: 'vector' as FieldDefinition['type'] }).tagName).toBe(
            'TEXTAREA',
        );
    });
});

describe('the Items field of a menu', () => {
    const fields = [{ name: 'Items', displayName: 'Items', type: 'json', isRequired: false }] as FieldDefinition[];

    it('is a list with move buttons, not a JSON textarea', () => {
        render(
            <DynamicForm
                contentType="menu"
                fields={fields}
                values={{ Items: [{ Label: 'Blog', Url: '/blog' }, { Label: 'Docs', Url: '/docs' }] }}
                onChange={() => {}}
            />,
        );
        expect(screen.getByRole('button', { name: 'Move Docs up' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Move Blog up' })).toBeDisabled();
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('stays a JSON textarea on any other type', () => {
        render(<DynamicForm contentType="article" fields={fields} values={{ Items: [] }} onChange={() => {}} />);
        expect(document.getElementById('Items')?.tagName).toBe('TEXTAREA');
    });

    it('shows a value it cannot read as the JSON it is, rather than dropping part of it', () => {
        const value = [{ Label: 'A', Children: [{ Label: 'B', Children: [{ Label: 'C' }] }] }];
        render(<DynamicForm contentType="menu" fields={fields} values={{ Items: value }} onChange={() => {}} />);
        const textarea = document.getElementById('Items') as HTMLTextAreaElement;
        expect(textarea.tagName).toBe('TEXTAREA');
        expect(JSON.parse(textarea.value)).toEqual(value);
    });
});
