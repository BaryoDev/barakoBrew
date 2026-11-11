import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstanceCard, hostInitials, nameInitials, reachabilityLabel } from './instance-card';

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

describe('InstanceCard on a browser that has signed in here before', () => {
    const remembered = {
        origin: 'https://api.cafe.example',
        name: 'Kapé Ana',
        version: '5.1.0',
        modules: 16,
        seenAt: '2026-11-11T09:00:00.000Z',
    };
    const now = new Date('2026-11-11T12:00:00.000Z');

    it('shows the name, initials tile, version, module count and when it was last seen', () => {
        const { container } = render(
            <InstanceCard host="api.cafe.example" reachability={{ reachable: true, ms: 42 }} remembered={remembered} now={now} />
        );
        expect(screen.getByText('Kapé Ana')).toBeInTheDocument();
        expect(screen.getByText('KA')).toBeInTheDocument();
        expect(container).toHaveTextContent('barakoCMS 5.1.0 · 16 modules');
        expect(container).toHaveTextContent('Last seen 3h ago');
        expect(screen.getByText('api.cafe.example')).toBeInTheDocument();
    });

    it('shows none of it on a first visit', () => {
        const { container } = render(
            <InstanceCard host="api.cafe.example" reachability={{ reachable: true, ms: 42 }} remembered={null} />
        );
        expect(container.textContent).not.toMatch(/Kapé|last seen|forget|modules|5\.1\.0/i);
    });

    it('forgets on the link', () => {
        const onForget = vi.fn();
        render(
            <InstanceCard host="api.cafe.example" reachability={undefined} remembered={remembered} onForget={onForget} now={now} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Forget this browser' }));
        expect(onForget).toHaveBeenCalledTimes(1);
    });
});

describe('Forget this browser focus', () => {
    it('moves focus to the card label, so it does not fall to the page', () => {
        const remembered = { origin: 'o', name: 'Kapé Ana', version: null, modules: null, seenAt: '2026-11-11T09:00:00.000Z' };
        render(<InstanceCard host="h" reachability={undefined} remembered={remembered} onForget={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Forget this browser' }));
        expect(screen.getByText('You are signing in to')).toHaveFocus();
    });

    it('gives the link a 44px target below 1000px', () => {
        const remembered = { origin: 'o', name: 'Kapé Ana', version: null, modules: null, seenAt: '2026-11-11T09:00:00.000Z' };
        render(<InstanceCard host="h" reachability={undefined} remembered={remembered} onForget={() => {}} />);
        expect(screen.getByRole('button', { name: 'Forget this browser' }).className).toContain('max-[999px]:min-h-11');
    });
});

describe('nameInitials', () => {
    it('takes the first letters of the first two words, else the first two letters', () => {
        expect(nameInitials('Kapé Ana')).toBe('KA');
        expect(nameInitials('Cafe')).toBe('CA');
    });
});
