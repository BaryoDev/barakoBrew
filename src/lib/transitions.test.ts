import { describe, it, expect } from 'vitest';
import { missingTransitionFields, transitionFields } from './transitions';
import type { FieldDefinition, StateTransition } from '@/types/schema';

const FIELDS: FieldDefinition[] = [
    { name: 'Amount', displayName: 'Amount', type: 'money', isRequired: true },
    { name: 'Reason', displayName: 'Reason', type: 'text', isRequired: false },
    { name: 'Note', displayName: 'Note', type: 'text', isRequired: false },
];

const REJECT: StateTransition = {
    name: 'Reject',
    from: 'Submitted',
    to: 'Draft',
    requiredFields: ['reason'],
    optionalFields: ['Note'],
};

describe('the fields a transition asks for', () => {
    it('lists the required and optional ones in the type order, matched without regard to case', () => {
        const asked = transitionFields(REJECT, FIELDS);

        expect(asked).toHaveLength(2);
        expect(asked.map((a) => [a.field.name, a.required])).toEqual([
            ['Reason', true],
            ['Note', false],
        ]);
    });

    it('asks for nothing on a transition from an API that does not send the lists', () => {
        expect(transitionFields({ name: 'Approve', from: 'Submitted', to: 'Approved' }, FIELDS)).toHaveLength(0);
    });

    it('counts a required field as missing until it holds something other than blank text', () => {
        const asked = transitionFields(REJECT, FIELDS);

        expect(missingTransitionFields(asked, {}).map((f) => f.name)).toEqual(['Reason']);
        expect(missingTransitionFields(asked, { Reason: '   ' }).map((f) => f.name)).toEqual(['Reason']);
        expect(missingTransitionFields(asked, { Reason: 'Wrong amount' })).toHaveLength(0);
    });
});
