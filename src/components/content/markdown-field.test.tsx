import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from './dynamic-form';
import { applyMark, countWords } from './markdown-field';
import type { FieldDefinition } from '@/types/schema';

const BODY: FieldDefinition = { name: 'Body', displayName: 'Body', type: 'markdown', isRequired: false } as FieldDefinition;

/** The real DynamicForm holding its own state, so a toggle that wrote the value back would show. */
function Harness({ initial, spy }: { initial: string; spy: (v: Record<string, unknown>) => void }) {
    const [values, setValues] = useState<Record<string, unknown>>({ Body: initial });
    return (
        <DynamicForm
            fields={[BODY]}
            values={values}
            onChange={(v) => {
                spy(v);
                setValues(v);
            }}
        />
    );
}

function setup(initial = '') {
    const spy = vi.fn();
    render(<Harness initial={initial} spy={spy} />);
    return { spy, textarea: () => document.getElementById('Body') as HTMLTextAreaElement };
}

// Radix tabs activate on mousedown, which is what a pointer sends first.
const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

describe('a markdown field', () => {
    it('is a composer with Write and Preview, and the textarea keeps the field id', () => {
        const { textarea } = setup();
        expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument();
        expect(textarea().tagName).toBe('TEXTAREA');
        expect(screen.getByLabelText('Body')).toBe(textarea());
    });

    it('previews headings, links and lists', () => {
        setup('# Spring roast\n\n- beans\n- water\n\n[Guide](https://example.com/guide)');
        openTab('Preview');
        const panel = screen.getByRole('tabpanel', { name: 'Preview' });
        expect(panel.querySelector('h1')?.textContent).toBe('Spring roast');
        expect(panel.querySelectorAll('li')).toHaveLength(2);
        const link = panel.querySelector('a');
        expect(link).toHaveAttribute('href', 'https://example.com/guide');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('neutralises a javascript: link and a raw script tag in the preview', () => {
        setup('[click me](javascript:alert(1))\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
        openTab('Preview');
        const panel = screen.getByRole('tabpanel', { name: 'Preview' });
        expect(panel.textContent).toContain('click me');
        expect(panel.querySelectorAll('a')).toHaveLength(0);
        expect(panel.querySelectorAll('script')).toHaveLength(0);
        expect(panel.querySelectorAll('img')).toHaveLength(0);
        expect(panel.textContent).toContain('<script>alert(1)</script>');
    });

    it('does not give preview headings ids that could shadow a field', () => {
        setup('# Body');
        openTab('Preview');
        expect(document.querySelectorAll('#body, #Body')).toHaveLength(1);
        expect(document.getElementById('Body')?.tagName).toBe('TEXTAREA');
    });

    it('leaves the stored value exactly as typed when switching between Write and Preview', () => {
        // Trailing spaces, a tab and a blank last line: anything a normaliser would touch.
        const typed = '## Notes  \n\n\tindented\n* star list\n\n';
        const { spy, textarea } = setup();
        fireEvent.change(textarea(), { target: { value: typed } });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith({ Body: typed });

        openTab('Preview');
        expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
        openTab('Write');
        openTab('Preview');
        openTab('Write');

        expect(spy).toHaveBeenCalledTimes(1);
        expect(textarea().value).toBe(typed);
    });

    it('opens an entry saved before the composer without changing it', () => {
        const saved = 'Old post\r\nwith <b>html</b> & [a](javascript:x)';
        const { spy } = setup(saved);
        openTab('Preview');
        openTab('Write');
        expect(spy).not.toHaveBeenCalled();
    });

    it('counts words', () => {
        setup('one two  three\nfour');
        expect(screen.getByText('4 words')).toBeInTheDocument();
        expect(countWords('   ')).toBe(0);
    });

    it('wraps the selection when a toolbar mark is pressed', () => {
        const { spy, textarea } = setup('make this bold');
        textarea().setSelectionRange(10, 14);
        fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
        expect(spy).toHaveBeenLastCalledWith({ Body: 'make this **bold**' });
        expect(screen.getByRole('toolbar', { name: 'Body formatting' })).toBeInTheDocument();
    });
});

describe('applyMark', () => {
    it('prefixes the line the caret is on', () => {
        expect(applyMark('first\nsecond', 8, 8, { name: 'List', prefix: '- ' })).toEqual({
            value: 'first\n- second',
            start: 10,
            end: 10,
        });
    });
});

describe('the long-text types that are not markdown', () => {
    it('keep a bare textarea, since richtext stores HTML and text is not markdown', () => {
        for (const type of ['text', 'richtext'] as const) {
            render(<DynamicForm fields={[{ ...BODY, name: type, type }]} values={{}} onChange={() => {}} />);
            expect(document.getElementById(type)?.tagName).toBe('TEXTAREA');
        }
        expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });
});
