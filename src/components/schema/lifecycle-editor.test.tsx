import { describe, it, expect, beforeAll, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LifecycleEditor } from './lifecycle-editor';
import { EMPTY_LIFECYCLE, lifecycleToSend } from '@/lib/lifecycle';
import type { LifecycleDefinition } from '@/types/schema';

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

const WITH_MOVE: LifecycleDefinition = {
    states: ['Recorded', 'Explained'],
    initialState: 'Recorded',
    transitions: [{ name: 'Explain', from: 'Recorded', to: 'Explained' }],
};

function Harness({ start, spy }: { start: LifecycleDefinition; spy: (v: LifecycleDefinition) => void }) {
    const [value, setValue] = useState(start);
    return (
        <LifecycleEditor
            value={value}
            onChange={(next) => {
                spy(next);
                setValue(next);
            }}
        />
    );
}

describe('LifecycleEditor', () => {
    it('adds states in order and makes the first one the initial state', () => {
        const spy = vi.fn();
        render(<Harness start={EMPTY_LIFECYCLE} spy={spy} />);
        const input = screen.getByLabelText('States, in order');
        fireEvent.change(input, { target: { value: 'Recorded' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add state' }));
        fireEvent.change(input, { target: { value: 'Explained' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add state' }));
        const last = spy.mock.calls.at(-1)![0] as LifecycleDefinition;
        expect(last.states).toEqual(['Recorded', 'Explained']);
        expect(last.initialState).toBe('Recorded');
    });

    it('produces the exact payload for a valid edit', () => {
        const spy = vi.fn();
        render(<Harness start={WITH_MOVE} spy={spy} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add transition' }));
        fireEvent.change(screen.getByLabelText('Transition 2 name'), { target: { value: 'Reopen' } });
        const last = spy.mock.calls.at(-1)![0] as LifecycleDefinition;
        expect(last.transitions).toHaveLength(2);
        expect(lifecycleToSend({ ...last, transitions: [last.transitions[0], { name: 'Reopen', from: 'Explained', to: 'Recorded' }] })).toEqual({
            states: ['Recorded', 'Explained'],
            initialState: 'Recorded',
            transitions: [
                { name: 'Explain', from: 'Recorded', to: 'Explained' },
                { name: 'Reopen', from: 'Explained', to: 'Recorded' },
            ],
        });
    });

    it('shows a problem for a state that is not PascalCase', () => {
        render(<Harness start={{ ...WITH_MOVE, states: ['recorded', 'Explained'] }} spy={vi.fn()} />);
        expect(screen.getByLabelText('Lifecycle problems')).toHaveTextContent(
            "State 'recorded' must be in PascalCase",
        );
    });

    it('shows a problem for a repeated transition name', () => {
        render(
            <Harness
                start={{
                    ...WITH_MOVE,
                    transitions: [
                        { name: 'Explain', from: 'Recorded', to: 'Explained' },
                        { name: 'Explain', from: 'Explained', to: 'Recorded' },
                    ],
                }}
                spy={vi.fn()}
            />,
        );
        expect(screen.getByLabelText('Lifecycle problems')).toHaveTextContent(
            "Transition 'Explain' is declared more than once.",
        );
    });

    it('refuses to remove a state a transition uses', () => {
        const spy = vi.fn();
        render(<Harness start={WITH_MOVE} spy={spy} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove state Explained' }));
        expect(spy).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('State Explained is used by Explain.');
    });

    it('removes a state once its transition is gone', () => {
        const spy = vi.fn();
        render(<Harness start={WITH_MOVE} spy={spy} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove transition Explain' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove state Explained' }));
        const last = spy.mock.calls.at(-1)![0] as LifecycleDefinition;
        expect(last.states).toEqual(['Recorded']);
    });

    it('draws a diagram with a box per state', () => {
        render(<Harness start={WITH_MOVE} spy={vi.fn()} />);
        expect(screen.getByRole('img', { name: /Lifecycle diagram: Recorded, Explained/ })).toBeInTheDocument();
    });
});
