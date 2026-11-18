import { forwardRef, memo } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { registerSignInMethod, SIGN_IN_METHODS } from './registry';
import { registerSlot } from '@/lib/extension-slots';

afterEach(() => {
    delete SIGN_IN_METHODS['url-test'];
    delete SIGN_IN_METHODS['wrapped-test'];
});

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
});
