import { createElement, forwardRef, lazy, memo } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { registerSignInMethod, SIGN_IN_METHODS } from './registry';
import { registerSlot } from '@/lib/extension-slots';

afterEach(() => {
    delete SIGN_IN_METHODS['url-test'];
    delete SIGN_IN_METHODS['wrapped-test'];
    delete SIGN_IN_METHODS['x'];
});

const good = () => ({ id: 'url-test', label: 'x', icon: () => null as never, Panel: () => null });

describe('the sign-in registry', () => {
    it('registry accepts no string or URL entry', () => {
        const before = Object.keys(SIGN_IN_METHODS);
        for (const bad of ['https://example.test/panel.js', '/panel.js', 'url-test']) {
            expect(() => registerSignInMethod(bad as never)).toThrow(TypeError);
            expect(() => registerSlot('sign-in-method', 'M', bad as never)).toThrow(TypeError);
        }
        expect(() =>
            registerSignInMethod({ id: 'url-test', label: 'x', icon: () => null as never, Panel: 'https://example.test/p.js' } as never),
        ).toThrow(TypeError);
        expect(() =>
            registerSignInMethod({ id: 'url-test', label: 'x', icon: () => null as never, Panel: { render: () => null } } as never),
        ).toThrow(TypeError);
        expect(Object.keys(SIGN_IN_METHODS)).toEqual(before);
    });

    it('accepts_a_forwardRef_icon_and_a_memo_panel', () => {
        const icon = forwardRef<SVGSVGElement>(function WrappedIcon() {
            return null;
        });
        const Panel = memo(function WrappedPanel() {
            return null;
        });
        registerSignInMethod({ id: 'wrapped-test', label: 'x', icon: icon as never, Panel: Panel as never });
        expect(SIGN_IN_METHODS['wrapped-test']).toBeDefined();
    });

    it('refuses_a_react_element_as_panel', () => {
        const before = Object.keys(SIGN_IN_METHODS);
        const element = createElement('div');
        expect(() => registerSignInMethod({ ...good(), Panel: element } as never)).toThrow(TypeError);
        expect(() => registerSignInMethod({ ...good(), icon: element } as never)).toThrow(TypeError);
        const Lazy = lazy(async () => ({ default: () => null }));
        expect(() => registerSignInMethod({ ...good(), Panel: Lazy } as never)).toThrow(TypeError);
        expect(Object.keys(SIGN_IN_METHODS)).toEqual(before);
    });

    it('refuses_to_replace_a_built_in_method', () => {
        const password = SIGN_IN_METHODS['password'];
        const emailCode = SIGN_IN_METHODS['email-code'];
        expect(() => registerSignInMethod({ ...good(), id: 'password' })).toThrow(TypeError);
        expect(() => registerSignInMethod({ ...good(), id: 'email-code' })).toThrow(TypeError);
        expect(SIGN_IN_METHODS['password']).toBe(password);
        expect(SIGN_IN_METHODS['email-code']).toBe(emailCode);
    });

    it('refuses a malformed entry', () => {
        const before = Object.keys(SIGN_IN_METHODS);
        const cases: [string, unknown][] = [
            ['null entry', null],
            ['empty id', { ...good(), id: '' }],
            ['capitalised id', { ...good(), id: 'Phone' }],
            ['padded id', { ...good(), id: ' x' }],
            ['__proto__ id', { ...good(), id: '__proto__' }],
            ['label not a string', { ...good(), label: 4 }],
            ['icon not a component', { ...good(), icon: 'icon' }],
        ];
        for (const [, entry] of cases) {
            expect(() => registerSignInMethod(entry as never)).toThrow(TypeError);
        }
        expect(Object.keys(SIGN_IN_METHODS)).toEqual(before);
    });
});
