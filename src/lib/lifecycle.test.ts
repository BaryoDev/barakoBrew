import { describe, it, expect } from 'vitest';
import { lifecycleProblems, lifecycleToSend, transitionsUsing, EMPTY_LIFECYCLE } from './lifecycle';
import type { LifecycleDefinition } from '@/types/schema';

const VALID: LifecycleDefinition = {
    states: ['Recorded', 'Explained', 'Approved'],
    initialState: 'Recorded',
    transitions: [
        { name: 'Explain', from: 'Recorded', to: 'Explained' },
        { name: 'Approve', from: 'Explained', to: 'Approved' },
    ],
};

describe('lifecycleProblems', () => {
    it('accepts a valid lifecycle', () => {
        expect(VALID.transitions).toHaveLength(2);
        expect(lifecycleProblems(VALID)).toEqual([]);
    });

    it('accepts an empty lifecycle, which means none', () => {
        expect(lifecycleProblems(EMPTY_LIFECYCLE)).toEqual([]);
    });

    it('rejects a state that is not PascalCase', () => {
        const problems = lifecycleProblems({ ...VALID, states: ['recorded', 'Explained', 'Approved'], initialState: 'Explained' });
        expect(problems).toContain("State 'recorded' must be in PascalCase, letters and digits only.");
    });

    it('rejects a repeated state, ignoring case', () => {
        const problems = lifecycleProblems({ ...VALID, states: ['Recorded', 'RECORDED'], transitions: [] });
        expect(problems).toContain("State 'RECORDED' is declared more than once.");
    });

    it('rejects an initial state that is not a known state', () => {
        const problems = lifecycleProblems({ ...VALID, initialState: 'Missing' });
        expect(problems).toContain("The initial state 'Missing' is not one of the declared states.");
    });

    it('rejects states with no initial state', () => {
        const problems = lifecycleProblems({ ...VALID, initialState: '' });
        expect(problems).toContain('A lifecycle must name the state a new entry starts in.');
    });

    it('rejects a transition that is not PascalCase', () => {
        const problems = lifecycleProblems({ ...VALID, transitions: [{ name: 'explain', from: 'Recorded', to: 'Explained' }] });
        expect(problems).toContain("Transition 'explain' must be in PascalCase, letters and digits only.");
    });

    it('rejects a repeated transition name', () => {
        const problems = lifecycleProblems({
            ...VALID,
            transitions: [
                { name: 'Explain', from: 'Recorded', to: 'Explained' },
                { name: 'explain', from: 'Explained', to: 'Approved' },
            ],
        });
        expect(problems).toContain("Transition 'explain' is declared more than once.");
    });

    it('rejects a transition from or to an unknown state', () => {
        const problems = lifecycleProblems({ ...VALID, transitions: [{ name: 'Reject', from: 'Nowhere', to: 'Gone' }] });
        expect(problems).toContain("Transition 'Reject' moves from 'Nowhere', which is not a declared state.");
        expect(problems).toContain("Transition 'Reject' moves to 'Gone', which is not a declared state.");
    });

    it('rejects a transition to its own state', () => {
        const problems = lifecycleProblems({ ...VALID, transitions: [{ name: 'Loop', from: 'Recorded', to: 'Recorded' }] });
        expect(problems).toContain("Transition 'Loop' moves 'Recorded' to itself, which changes nothing.");
    });

    it('rejects a transition with no name', () => {
        const problems = lifecycleProblems({ ...VALID, transitions: [{ name: '', from: 'Recorded', to: 'Explained' }] });
        expect(problems).toHaveLength(1);
    });
});

describe('transitionsUsing', () => {
    it('names the transitions that start or end at a state', () => {
        expect(transitionsUsing(VALID, 'Explained')).toEqual(['Explain', 'Approve']);
        expect(transitionsUsing(VALID, 'Recorded')).toEqual(['Explain']);
    });
});

describe('lifecycleToSend', () => {
    it('sends null for an empty lifecycle so the type keeps Draft, Published and Archived', () => {
        expect(lifecycleToSend(EMPTY_LIFECYCLE)).toBeNull();
    });

    it('sends exactly the states, initial state and named moves', () => {
        expect(lifecycleToSend(VALID)).toEqual({
            states: ['Recorded', 'Explained', 'Approved'],
            initialState: 'Recorded',
            transitions: [
                { name: 'Explain', from: 'Recorded', to: 'Explained' },
                { name: 'Approve', from: 'Explained', to: 'Approved' },
            ],
        });
    });
});
