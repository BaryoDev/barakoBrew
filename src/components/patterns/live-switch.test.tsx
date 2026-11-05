import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveSwitch } from './live-switch';

describe('the Live / Paused switch', () => {
    it('reads Live and is on while the feed is live', () => {
        render(<LiveSwitch live onChange={() => {}} />);
        const control = screen.getByRole('switch', { name: 'Live updates' });
        expect(control).toHaveAttribute('aria-checked', 'true');
        expect(control).toHaveTextContent('Live');
        expect(control.className).toContain('h-[38px]');
        expect(control.querySelector('span')?.className).toContain('pulse');
    });

    it('reads Paused and stops pulsing when it is off', () => {
        render(<LiveSwitch live={false} onChange={() => {}} />);
        const control = screen.getByRole('switch');
        expect(control).toHaveAttribute('aria-checked', 'false');
        expect(control).toHaveTextContent('Paused');
        expect(control.querySelector('span')?.className).not.toContain('pulse');
    });

    it('does not pulse while it is on but stalled', () => {
        render(<LiveSwitch live stalled onChange={() => {}} />);
        expect(screen.getByRole('switch').querySelector('span')?.className).not.toContain('pulse');
    });

    it('asks for the opposite state when pressed', () => {
        const onChange = vi.fn();
        render(<LiveSwitch live onChange={onChange} label="Live activity" />);
        fireEvent.click(screen.getByRole('switch', { name: 'Live activity' }));
        expect(onChange).toHaveBeenCalledWith(false);
    });
});
