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

    it('names the step with a badge and an h1 for each kind', () => {
        const { rerender } = render(<CodeStep {...base} kind="device" pending={false} />);
        expect(screen.getByText('New device')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
        expect(screen.getByText(/has not signed in to this instance before/)).toBeInTheDocument();
        rerender(<CodeStep {...base} kind="code" pending={false} />);
        expect(screen.getByText('Email code')).toBeInTheDocument();
        rerender(<CodeStep {...base} kind="totp" pending={false} />);
        expect(screen.getByText('Two-step')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Open your authenticator' })).toBeInTheDocument();
    });

    it('shows the wrong-code banner above the field and marks the field invalid', () => {
        render(<CodeStep {...base} pending={false} error="That code did not match." />);
        const banner = screen.getByRole('alert');
        const field = screen.getByLabelText('Device approval code');
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(banner.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('reads Sent again after a new code has gone', () => {
        const onResend = vi.fn((sent: () => void) => sent());
        render(<CodeStep {...base} kind="code" onResend={onResend} pending={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
        expect(screen.getByRole('button', { name: 'Sent again' })).toBeInTheDocument();
    });

    it('says Checking while a code is in flight and spaces the digits at .42em', () => {
        render(<CodeStep {...base} pending />);
        expect(screen.getByRole('button', { name: 'Checking…' })).toBeInTheDocument();
        expect(screen.getByLabelText('Device approval code').className).toContain('tracking-[0.42em]');
    });
});
