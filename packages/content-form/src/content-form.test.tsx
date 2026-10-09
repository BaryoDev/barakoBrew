import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentForm } from './content-form';
import { SensitivityLevel, type FieldDefinition } from './definition';

/**
 * A definition this package has never seen, written here rather than taken from a console fixture.
 * The whole point of the extraction is that nothing in the renderer knows which application is
 * calling it, so the test that proves it imports no application either.
 */
const FIELDS: FieldDefinition[] = [
    { name: 'Title', displayName: 'Title', type: 'string', isRequired: true },
    { name: 'Body', displayName: 'Body', type: 'text', isRequired: false },
    { name: 'Seats', displayName: 'Seats', type: 'integer', isRequired: false },
    { name: 'StartsAt', displayName: 'Starts at', type: 'datetime', isRequired: false },
    { name: 'Live', displayName: 'Live', type: 'bool', isRequired: false },
    { name: 'Contact', displayName: 'Contact', type: 'email', isRequired: false },
    { name: 'Where', displayName: 'Where', type: 'geopoint', isRequired: false },
];

function renderForm(props: Partial<React.ComponentProps<typeof ContentForm>> = {}) {
    const onChange = vi.fn();
    render(
        <ContentForm
            fields={FIELDS}
            values={{}}
            onChange={onChange}
            viewerRoles={[]}
            {...props}
        />
    );
    return onChange;
}

describe('a definition the package has never seen', () => {
    it('gets one control per field, each matching the field type', () => {
        renderForm();

        const controls = FIELDS.map((f) => document.getElementById(f.name));
        expect(controls).toHaveLength(7);
        expect(controls.every((c) => c !== null)).toBe(true);

        expect(document.getElementById('Title')).toHaveAttribute('type', 'text');
        expect(document.getElementById('Title')!.tagName).toBe('INPUT');
        expect(document.getElementById('Body')!.tagName).toBe('TEXTAREA');
        expect(document.getElementById('Seats')).toHaveAttribute('type', 'number');
        expect(document.getElementById('Seats')).toHaveAttribute('step', '1');
        expect(document.getElementById('StartsAt')).toHaveAttribute('type', 'datetime-local');
        expect(document.getElementById('Live')).toHaveAttribute('role', 'switch');
        expect(document.getElementById('Contact')).toHaveAttribute('type', 'email');
        expect(document.getElementById('Where')!.tagName).toBe('TEXTAREA');
    });

    it('marks a required field on its label', () => {
        renderForm();
        expect(screen.getByText('Title').textContent).toContain('*');
    });

    it('says so rather than drawing nothing when the definition has no fields', () => {
        render(<ContentForm fields={[]} values={{}} onChange={() => {}} viewerRoles={[]} />);
        expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
    });
});

describe('a host control', () => {
    it('takes over the field it claims and leaves the rest to the package', () => {
        renderForm({
            renderField: ({ field }) =>
                field.name === 'Body' ? <p>host drew Body</p> : null,
        });

        expect(screen.getByText('host drew Body')).toBeInTheDocument();
        expect(document.getElementById('Body')).toBeNull();
        expect(document.getElementById('Title')).not.toBeNull();
    });
});

describe('a field the viewer may not read', () => {
    const sensitive: FieldDefinition[] = [
        {
            name: 'Salary',
            displayName: 'Salary',
            type: 'string',
            isRequired: false,
            sensitivity: SensitivityLevel.Sensitive,
        },
    ];

    function renderSensitive(viewerRoles: string[], renderField?: () => React.ReactNode) {
        render(
            <ContentForm
                fields={sensitive}
                values={{ Salary: '***' }}
                onChange={() => {}}
                viewerRoles={viewerRoles}
                renderField={renderField}
            />
        );
        return document.getElementById('Salary') as HTMLInputElement;
    }

    it('is read only, and says why, for a role the API masks it from', () => {
        const control = renderSensitive(['Editor']);
        expect(control).toHaveAttribute('readonly');
        expect(screen.getByText(/cannot read this field/i)).toBeInTheDocument();
    });

    it('is editable for a role the API lets through', () => {
        expect(renderSensitive(['HR'])).not.toHaveAttribute('readonly');
        expect(renderSensitive(['SuperAdmin'])).not.toHaveAttribute('readonly');
    });

    it('is editable for a role the API lets through by capability, when the host passes capabilities', () => {
        render(
            <ContentForm
                fields={sensitive}
                values={{ Salary: '90000' }}
                onChange={() => {}}
                viewerRoles={['Nurse']}
                viewerCapabilities={['view_sensitive']}
            />
        );
        expect(document.getElementById('Salary')).not.toHaveAttribute('readonly');
    });

    // The reason sensitivity lives here and not in the caller: a host that draws its own control
    // for this field would otherwise have to remember, and would be the only thing standing between
    // an editor and a box whose edits the API silently throws away.
    it('never reaches a host control', () => {
        const host = vi.fn(() => <p>host drew Salary</p>);
        renderSensitive(['Editor'], host);
        expect(host).not.toHaveBeenCalled();
        expect(screen.queryByText('host drew Salary')).toBeNull();
    });
});

describe('a JSON field whose value is replaced from outside', () => {
    const fields: FieldDefinition[] = [
        { name: 'Prefs', displayName: 'Prefs', type: 'json', isRequired: false },
    ];

    function draw(values: Record<string, unknown>) {
        return (
            <ContentForm fields={fields} values={values} onChange={() => {}} viewerRoles={['SuperAdmin']} />
        );
    }

    // The entry is reloaded on a save conflict, rolled back, or the create screen is pointed at
    // another type. The control stays mounted through all three, and it used to keep drawing the
    // JSON from before.
    it('shows the value that arrived, not the one it was holding', () => {
        const { rerender } = render(draw({ Prefs: { theme: 'dark' } }));
        const box = document.getElementById('Prefs') as HTMLTextAreaElement;
        expect(JSON.parse(box.value)).toEqual({ theme: 'dark' });

        rerender(draw({ Prefs: { theme: 'light', density: 'compact' } }));
        expect(JSON.parse((document.getElementById('Prefs') as HTMLTextAreaElement).value)).toEqual({
            theme: 'light',
            density: 'compact',
        });
    });

    it('keeps half-typed JSON while the value it came from is unchanged', () => {
        // The other half of the same rule. A redraw for any other reason must not throw away what
        // somebody is in the middle of typing, which is why the text is state and not derived.
        const values = { Prefs: { theme: 'dark' } };
        const { rerender } = render(draw(values));
        const box = document.getElementById('Prefs') as HTMLTextAreaElement;

        fireEvent.change(box, { target: { value: '{ "theme": ' } });
        rerender(draw(values));

        expect((document.getElementById('Prefs') as HTMLTextAreaElement).value).toBe('{ "theme": ');
        expect(screen.getByText(/Not valid JSON yet/)).toBeInTheDocument();
    });
});

describe('sections', () => {
    const sectioned: FieldDefinition[] = [
        { name: 'Name', displayName: 'Name', type: 'string', isRequired: false, section: 'Details' },
        { name: 'Note', displayName: 'Note', type: 'string', isRequired: false },
        { name: 'Logo', displayName: 'Logo', type: 'url', isRequired: false, section: 'Branding' },
        { name: 'Starts', displayName: 'Starts', type: 'date', isRequired: false, section: 'Details' },
    ];

    it('groups fields under their section, in the order each section first appears', () => {
        render(<ContentForm fields={sectioned} values={{}} onChange={() => {}} viewerRoles={[]} />);

        const groups = screen.getAllByRole('group');
        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.querySelector('legend')?.textContent)).toEqual(['Details', 'Branding']);
        // Starts comes after Logo in the type and still sits with the first Details field.
        expect(groups[0].querySelector('#Name')).not.toBeNull();
        expect(groups[0].querySelector('#Starts')).not.toBeNull();
        expect(groups[1].querySelector('#Logo')).not.toBeNull();
    });

    it('leaves a field in no section outside every group', () => {
        render(<ContentForm fields={sectioned} values={{}} onChange={() => {}} viewerRoles={[]} />);

        expect(document.getElementById('Note')).not.toBeNull();
        expect(document.getElementById('Note')!.closest('fieldset')).toBeNull();
    });

    it('draws no group at all for a type that names no section', () => {
        renderForm();
        expect(screen.queryAllByRole('group')).toHaveLength(0);
    });
});

describe('a money field', () => {
    it('with a currency, shows the code and steps by its decimal places', () => {
        render(
            <ContentForm
                fields={[{ name: 'Total', displayName: 'Total', type: 'money', isRequired: false, currency: 'USD' }]}
                values={{ Total: 12.5 }}
                onChange={() => {}}
                viewerRoles={[]}
            />
        );

        expect(document.getElementById('Total')).toHaveAttribute('step', '0.01');
        expect(screen.getByText('An amount in USD, up to 2 decimal places.')).toBeInTheDocument();
    });

    it('takes a declared scale over the currency default', () => {
        render(
            <ContentForm
                fields={[
                    { name: 'Price', displayName: 'Price', type: 'money', isRequired: false, currency: 'USD', scale: 4 },
                ]}
                values={{}}
                onChange={() => {}}
                viewerRoles={[]}
            />
        );

        expect(document.getElementById('Price')).toHaveAttribute('step', '0.0001');
    });

    it('without a currency, stays a plain number', () => {
        render(
            <ContentForm
                fields={[{ name: 'Total', displayName: 'Total', type: 'money', isRequired: false }]}
                values={{}}
                onChange={() => {}}
                viewerRoles={[]}
            />
        );

        expect(document.getElementById('Total')).toHaveAttribute('step', 'any');
        expect(screen.queryByText(/An amount in/)).toBeNull();
    });
});

describe('a token field', () => {
    it('shows the token read only', () => {
        const onChange = vi.fn();
        render(
            <ContentForm
                fields={[
                    {
                        name: 'Claim',
                        displayName: 'Claim',
                        type: 'token',
                        isRequired: false,
                        sensitivity: SensitivityLevel.Hidden,
                        visibleToRoles: ['Desk'],
                    },
                ]}
                values={{ Claim: 'abc123defg456hjk' }}
                onChange={onChange}
                viewerRoles={['Desk']}
            />
        );

        const box = document.getElementById('Claim') as HTMLInputElement;
        expect(box).toHaveAttribute('readonly');
        expect(box.value).toBe('abc123defg456hjk');
        expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
    });
});

describe('the package', () => {
    it('imports nothing from an application', () => {
        const dir = __dirname;
        const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
        expect(sources.length).toBeGreaterThan(3);

        const reaching = sources.filter((file) => {
            const source = readFileSync(join(dir, file), 'utf8');
            return /from ['"]@\//.test(source) || /from ['"]\.\.\//.test(source);
        });
        expect(reaching).toEqual([]);
    });
});

describe('a value stored under another spelling of the field name', () => {
    it('shows a value stored as title for the field Title', () => {
        renderForm({ values: { title: 'Stored in lower case' } });
        expect(document.getElementById('Title')).toHaveValue('Stored in lower case');
    });

    it('saves under the stored key and never adds a second spelling', () => {
        const onChange = renderForm({ values: { title: 'Old', Body: 'Kept' } });
        fireEvent.change(document.getElementById('Title')!, { target: { value: 'New' } });

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toEqual({ title: 'New', Body: 'Kept' });
    });

    it('saves a value nothing stored yet under the field name', () => {
        const onChange = renderForm({ values: { Body: 'Kept' } });
        fireEvent.change(document.getElementById('Title')!, { target: { value: 'New' } });

        expect(onChange.mock.calls[0][0]).toEqual({ Body: 'Kept', Title: 'New' });
    });

    it('takes the exact spelling when the entry holds both', () => {
        renderForm({ values: { title: 'lower', Title: 'exact' } });
        expect(document.getElementById('Title')).toHaveValue('exact');
    });

    it('shows the other spelling of an entry holding both, and removes it only when asked', () => {
        const onChange = renderForm({ values: { title: 'lower', Title: 'exact', Body: 'Kept' } });

        const notice = screen.getByRole('alert');
        expect(notice.textContent).toContain('title: lower');
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Remove the spelling title' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toEqual({ Title: 'exact', Body: 'Kept' });
    });

    it('shows no notice when the entry holds one spelling', () => {
        renderForm({ values: { title: 'lower' } });
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
