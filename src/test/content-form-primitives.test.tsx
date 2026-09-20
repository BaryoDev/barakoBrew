import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ElementType } from 'react';
import { Input, Label, Switch, Textarea } from 'barako-content-form';
import { Input as AppInput } from '@/components/ui/input';
import { Label as AppLabel } from '@/components/ui/label';
import { Switch as AppSwitch } from '@/components/ui/switch';
import { Textarea as AppTextarea } from '@/components/ui/textarea';

/**
 * barako-content-form carries its own copies of the four shadcn/ui primitives the form draws with,
 * because a package that imports `@/components/ui` is not extracted from anything.
 *
 * Two copies drift. The renderer moving out of the console was supposed to change nothing about
 * what it draws, and the way that promise breaks quietly is one of these getting a class the other
 * did not, months later, in a pull request about something else. This renders both and compares the
 * markup, so the drift is a failing test rather than a screen nobody looked at twice.
 */
const PAIRS: { name: string; a: ElementType; b: ElementType }[] = [
    { name: 'Input', a: Input, b: AppInput },
    { name: 'Textarea', a: Textarea, b: AppTextarea },
    { name: 'Label', a: Label, b: AppLabel },
    { name: 'Switch', a: Switch, b: AppSwitch },
];

function markup(Component: ElementType) {
    const { container, unmount } = render(<Component />);
    const html = container.innerHTML;
    unmount();
    return html;
}

describe('the form package and the console draw the same controls', () => {
    it('has a copy of every primitive the form uses', () => {
        expect(PAIRS).toHaveLength(4);
        expect(PAIRS.every((p) => p.a && p.b)).toBe(true);
    });

    it.each(PAIRS)('$name renders identically in both', ({ a, b }) => {
        expect(markup(a)).toBe(markup(b));
    });
});
