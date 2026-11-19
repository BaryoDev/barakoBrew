import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DynamicForm } from './dynamic-form';
import { InlineImageField } from './inline-image-field';
import { dataUriBytes } from '@/lib/inline-image';
import type { FieldDefinition } from '@/types/schema';

const FIELDS: FieldDefinition[] = [{ name: 'Logo', displayName: 'Logo', type: 'inlineimage', isRequired: false }];

function renderField(value: unknown = undefined) {
    const onChange = vi.fn();
    render(<DynamicForm fields={FIELDS} values={value === undefined ? {} : { Logo: value }} onChange={onChange} />);
    return onChange;
}

function choose(file: File) {
    fireEvent.change(document.getElementById('Logo')!, { target: { files: [file] } });
}

describe('an inline image field', () => {
    it('stores a small PNG as a data URI with its alt text', async () => {
        const onChange = renderField();

        choose(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' }));

        await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
        const value = onChange.mock.calls[0][0].Logo as { url: string; alt: unknown };
        expect(value.url.startsWith('data:image/png;base64,')).toBe(true);
        expect(value.alt).toBeNull();
    });

    it('refuses an SVG before reading it', () => {
        const onChange = renderField();

        choose(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));

        expect(screen.getByText(/SVG is not accepted/, { selector: '.text-destructive' })).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('refuses an image over 64 KB before reading it', () => {
        const onChange = renderField();

        choose(new File([new Uint8Array(64 * 1024 + 1)], 'big.png', { type: 'image/png' }));

        expect(screen.getByText(/at most 64 KB/)).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('edits the alt text of a stored image and keeps the image', () => {
        const stored = { url: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Old' };
        const onChange = renderField(stored);

        expect(screen.getByRole('img')).toHaveAttribute('src', stored.url);
        fireEvent.change(screen.getByLabelText('Alt text'), { target: { value: 'Acme logo' } });

        expect(onChange).toHaveBeenCalledWith({ Logo: { url: stored.url, alt: 'Acme logo' } });
    });

    it('does not draw a stored value that is not an allowed data URI', () => {
        renderField({ url: 'javascript:alert(1)', alt: 'x' });

        expect(screen.queryByRole('img')).toBeNull();
    });

    it('shows the note about versions under the field', () => {
        renderField();

        expect(screen.getByTestId('inline-image-note').textContent).toBe(
            'Inline images are stored in every saved version of the entry, so keep them small.'
        );
    });

    it('shows the decoded size against the limit once an image is stored', () => {
        // 12 base64 characters with no padding decode to 9 bytes.
        renderField({ url: 'data:image/png;base64,AAAAAAAAAAAA', alt: null });

        expect(screen.getByTestId('inline-image-size').textContent).toBe('0.0 KB of 64 KB');
        const meter = screen.getByRole('meter', { name: 'Inline image size' });
        expect(meter).toHaveAttribute('aria-valuenow', '9');
        expect(meter).toHaveAttribute('aria-valuemax', String(64 * 1024));
    });

    it('has no meter before an image is chosen', () => {
        renderField();

        expect(screen.queryByRole('meter')).toBeNull();
    });

    it('counts base64 padding when it decodes the size', () => {
        expect(dataUriBytes('data:image/png;base64,QQ==')).toBe(1);
        expect(dataUriBytes('data:image/png;base64,QUI=')).toBe(2);
        expect(dataUriBytes('data:image/png;base64,QUJD')).toBe(3);
    });

    it('refuses an image over a smaller limit, naming that limit, before any read', () => {
        const onChange = vi.fn();
        render(
            <InlineImageField
                field={FIELDS[0]}
                label="Logo"
                value={undefined}
                maxBytes={2 * 1024}
                onChange={onChange}
            />
        );

        choose(new File([new Uint8Array(3 * 1024)], 'mid.png', { type: 'image/png' }));

        expect(screen.getByText(/at most 2 KB/, { selector: '.text-destructive' })).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
