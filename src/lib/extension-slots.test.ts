import { describe, it, expect, afterEach } from 'vitest';
import { registerSlot, resetSlots } from './extension-slots';
import { SIGN_IN_METHODS } from '@/components/sign-in/registry';
import type { SignInMethodEntry } from '@/components/sign-in/types';

afterEach(() => {
    resetSlots();
    delete SIGN_IN_METHODS['slot-test'];
});

describe('extension slots', () => {
    it('sign_in_method_slot_registers_an_entry', () => {
        const entry: SignInMethodEntry = {
            id: 'slot-test',
            label: 'Slot test',
            icon: () => null as never,
            Panel: () => null,
        };
        expect(SIGN_IN_METHODS['slot-test']).toBeUndefined();

        registerSlot('sign-in-method', 'SlotTest', entry);

        expect(SIGN_IN_METHODS['slot-test']).toBe(entry);
    });

    it('an_unknown_slot_kind_is_a_type_error', () => {
        expect(() => {
            // @ts-expect-error 'nope' is not a slot kind
            registerSlot('nope', 'Module', () => null);
        }).toThrow();
    });
});
