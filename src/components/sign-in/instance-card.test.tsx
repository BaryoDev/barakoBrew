import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstanceCard, hostInitials, reachabilityLabel } from './instance-card';

describe('InstanceCard before sign in', () => {
    it('shows the host and that it answers, and nothing from inside the tenant', () => {
        const { container } = render(<InstanceCard host="api.cafe.example" reachability={{ reachable: true, ms: 42 }} />);

        expect(screen.getByText('api.cafe.example')).toBeInTheDocument();
        expect(container).toHaveTextContent('Reachable · 42 ms');

        const text = container.textContent ?? '';
        expect(text).not.toMatch(/barakoCMS\s*\d/i);
        expect(text).not.toMatch(/module/i);
        expect(text).not.toMatch(/\d+\.\d+\.\d+/);
        expect(text).not.toMatch(/checked/i);
    });

    it('says so when the instance does not answer', () => {
        render(<InstanceCard host="api.cafe.example" reachability={{ reachable: false, ms: null }} />);
        expect(screen.getByText('Unreachable')).toBeInTheDocument();
    });

    it('says it is checking before the first answer', () => {
        render(<InstanceCard host="api.cafe.example" reachability={undefined} />);
        expect(screen.getByText('Checking…')).toBeInTheDocument();
    });
});

describe('reachabilityLabel', () => {
    it('leaves the time out when there is none', () => {
        expect(reachabilityLabel({ reachable: true, ms: null })).toEqual({ word: 'Reachable', detail: '' });
    });

    it('keeps the time apart from the state word', () => {
        expect(reachabilityLabel({ reachable: true, ms: 42 })).toEqual({ word: 'Reachable', detail: ' · 42 ms' });
    });
});

describe('the live region', () => {
    it('holds the state word only, so a changing time is not announced every recheck', () => {
        render(<InstanceCard host="api.cafe.example" reachability={{ reachable: true, ms: 42 }} />);
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent(/^Reachable$/);
        expect(status.textContent).not.toMatch(/ms/);
    });
});

describe('hostInitials', () => {
    it('takes two letters from the first label of the host', () => {
        expect(hostInitials('api.cafe.example')).toBe('AP');
        expect(hostInitials('localhost:5005')).toBe('LO');
        expect(hostInitials(null)).toBe('··');
    });
});
