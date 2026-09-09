import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * The segmented control, covered for the one thing that separates it from a row of buttons: the
 * keyboard contract.
 *
 * The screens that wanted this were each drawing their own strip of <button aria-pressed>. A strip
 * like that is one tab stop per option, so tabbing through the Entries filter took five presses to
 * get past four choices nobody wanted to change, and arrow keys did nothing. The design calls this
 * a segmented control and axe reads it as a radio group, so it has to behave like one: the group is
 * a single tab stop, and arrows move the selection inside it.
 *
 * These cases are the ones that fail if someone later swaps the implementation back to plain
 * buttons, which is exactly the regression worth pinning.
 */
const { SegmentedControl, SegmentedControlItem } = await import('./segmented-control');

const RANGES = ['24h', '7d', '30d', '90d'];

/** The analytics range picker, the first real use, rendered controlled by the caller. */
function Picker({ onValueChange }: { onValueChange?: (v: string) => void }) {
    const [value, setValue] = useState('7d');
    return (
        <SegmentedControl
            aria-label="Range"
            value={value}
            onValueChange={(v) => {
                setValue(v);
                onValueChange?.(v);
            }}
        >
            {RANGES.map((r) => (
                <SegmentedControlItem key={r} value={r}>
                    {r}
                </SegmentedControlItem>
            ))}
        </SegmentedControl>
    );
}

const options = () => screen.getAllByRole('radio');
const checked = () => options().find((o) => o.getAttribute('aria-checked') === 'true');

describe('the segmented control', () => {
    // axe classifies a group of mutually exclusive choices as a radio group, and the roles are what
    // it reads. aria-pressed buttons, which is what the hand-rolled strips used, announce four
    // independent toggles instead of one choice out of four.
    it('is a radio group, not a row of toggle buttons', () => {
        render(<Picker />);

        expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeInTheDocument();
        expect(options()).toHaveLength(4);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(checked()).toHaveTextContent('7d');
    });

    it('reports the option that was clicked', () => {
        const onValueChange = vi.fn();
        render(<Picker onValueChange={onValueChange} />);

        fireEvent.click(screen.getByRole('radio', { name: '30d' }));

        expect(onValueChange).toHaveBeenCalledWith('30d');
        expect(checked()).toHaveTextContent('30d');
    });

    // Clicking the option that is already on is not a change. Without this the analytics page
    // refetches every time someone taps the current range.
    it('does not re-report the option that is already selected', () => {
        const onValueChange = vi.fn();
        render(<Picker onValueChange={onValueChange} />);

        fireEvent.click(screen.getByRole('radio', { name: '7d' }));

        expect(onValueChange).not.toHaveBeenCalled();
    });

    // The half of the keyboard contract that plain buttons never had. In a radio group the arrows
    // both move focus and change the selection, so one press is one new value. Radix moves the
    // focus on a timeout, hence the wait: asserting straight after the keydown reads the old value
    // and passes for the wrong reason.
    it('moves the selection with the arrow keys', async () => {
        const onValueChange = vi.fn();
        render(<Picker onValueChange={onValueChange} />);

        act(() => checked()!.focus());

        fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
        await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith('30d'));
        expect(checked()).toHaveTextContent('30d');

        fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
        await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith('7d'));
        expect(checked()).toHaveTextContent('7d');
    });

    // Down and up are the same movement on a horizontal group. Reading the WAI-ARIA radio group
    // pattern as "left and right only" is the usual miss, and someone pressing Down gets nothing.
    it('treats ArrowDown and ArrowUp the same as right and left', async () => {
        render(<Picker />);

        act(() => checked()!.focus());

        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        await waitFor(() => expect(checked()).toHaveTextContent('30d'));

        fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
        await waitFor(() => expect(checked()).toHaveTextContent('7d'));
    });

    // Arrows wrap, so the last option's right arrow returns to the first. Without it the control
    // has dead ends, and the 24h end of the analytics picker is three presses away from the 90d end.
    it('wraps at the ends', async () => {
        render(<Picker />);

        fireEvent.click(screen.getByRole('radio', { name: '90d' }));
        act(() => checked()!.focus());

        fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
        await waitFor(() => expect(checked()).toHaveTextContent('24h'));
    });

    // The reason the issue asked for this at all. Four options must cost one Tab, not four, so the
    // group holds the single tab stop and no option sits in the tab order on its own. Tabbing past
    // the Entries filter used to take five presses.
    it('is one tab stop for the whole group', () => {
        const { container } = render(<Picker />);

        expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
        expect(screen.getByRole('radiogroup', { name: 'Range' })).toHaveAttribute('tabindex', '0');
        options().forEach((o) => expect(o).toHaveAttribute('tabindex', '-1'));
    });

    // And the one tab stop leads to the option that is on, not to the first one. Tab in, arrows to
    // move, Tab out: that is the whole interaction.
    it('puts focus on the selected option when the group is tabbed into', () => {
        render(<Picker />);

        act(() => screen.getByRole('radiogroup', { name: 'Range' }).focus());

        expect(document.activeElement).toHaveTextContent('7d');
        expect(document.activeElement).toHaveAttribute('tabindex', '0');
    });

    it('follows the selection, so tabbing back in lands on the new choice', () => {
        render(<Picker />);

        fireEvent.click(screen.getByRole('radio', { name: '90d' }));
        act(() => screen.getByRole('radiogroup', { name: 'Range' }).focus());

        expect(document.activeElement).toHaveTextContent('90d');
    });

    // The track and thumb are the spec's, and the thumb is what tells a sighted user which option
    // is on. Pinned by data-slot so the styling hooks survive a refactor of the class strings.
    it('marks the track and the active thumb for styling', () => {
        const { container } = render(<Picker />);

        expect(container.querySelector('[data-slot="segmented-control"]')).toBeInTheDocument();
        expect(checked()).toHaveAttribute('data-slot', 'segmented-control-item');
        expect(checked()).toHaveAttribute('data-state', 'checked');
    });

    it('leaves a disabled option unselectable', () => {
        const onValueChange = vi.fn();
        render(
            <SegmentedControl aria-label="Method" value="GET" onValueChange={onValueChange}>
                <SegmentedControlItem value="GET">GET</SegmentedControlItem>
                <SegmentedControlItem value="DELETE" disabled>
                    DELETE
                </SegmentedControlItem>
            </SegmentedControl>,
        );

        fireEvent.click(screen.getByRole('radio', { name: 'DELETE' }));

        expect(onValueChange).not.toHaveBeenCalled();
    });
});
