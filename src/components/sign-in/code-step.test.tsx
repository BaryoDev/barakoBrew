import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeStep } from './code-step';

const base = { kind: 'device' as const, email: 'ana@cafe.example', error: null, onSubmit: vi.fn(), onBack: vi.fn() };

describe('CodeStep', () => {
    it('cannot be left while a verify is in flight, so a late success cannot sign in behind a Go back', () => {
        const onBack = vi.fn();
        render(<CodeStep {...base} onBack={onBack} pending />);
        const back = screen.getByRole('button', { name: 'Not you? Go back' });
        expect(back).toBeDisabled();
        fireEvent.click(back);
        expect(onBack).not.toHaveBeenCalled();
    });

    it('can be left when nothing is in flight', () => {
        const onBack = vi.fn();
        render(<CodeStep {...base} onBack={onBack} pending={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Not you? Go back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
