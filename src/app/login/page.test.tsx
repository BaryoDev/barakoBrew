import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let listed: string[] | undefined;
const idle = { mutate: vi.fn(), isPending: false };

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ isAuthenticated: false, isLoading: false }),
    useLogin: () => idle,
    useVerifyMfa: () => idle,
    useVerifyDeviceCode: () => idle,
    useRequestSignInCode: () => idle,
}));
vi.mock('@/hooks/use-auth-providers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/hooks/use-auth-providers')>()),
    useAuthProviders: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-sign-in-methods', () => ({ useSignInMethods: () => ({ data: listed }) }));
vi.mock('@/hooks/use-instance-reachability', () => ({
    useInstanceReachability: () => ({ data: { reachable: true, ms: 42 } }),
}));

const { default: LoginPage } = await import('./page');
const { registerSignInMethod, SIGN_IN_METHODS } = await import('@/components/sign-in/registry');

describe('sign-in method tabs', () => {
    beforeEach(() => {
        listed = ['password', 'email-code'];
        delete SIGN_IN_METHODS['scan-qr'];
    });

    it('draws two tabs when password and email-code are listed', () => {
        render(<LoginPage />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map((t) => t.textContent)).toEqual(['Password', 'Email code']);
    });

    it('adds no tab for a listed id that has no registered component', () => {
        listed = ['password', 'email-code', 'scan-qr'];
        render(<LoginPage />);
        expect(screen.getAllByRole('tab')).toHaveLength(2);
        expect(screen.queryByRole('tab', { name: /scan/i })).toBeNull();
    });

    it('adds a tab for a listed id once a component is registered under it, without touching the page', () => {
        listed = ['password', 'email-code', 'scan-qr'];
        registerSignInMethod({
            id: 'scan-qr',
            label: 'Scan QR',
            icon: () => <svg />,
            Panel: () => <p>scan panel</p>,
        });
        render(<LoginPage />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(3);
        expect(tabs[2]).toHaveTextContent('Scan QR');
    });

    it('draws no tab for email-code when the server does not list it', () => {
        listed = ['password'];
        render(<LoginPage />);
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });

    it('keeps every tab on one line', () => {
        render(<LoginPage />);
        for (const tab of screen.getAllByRole('tab')) {
            expect(tab.className).toContain('whitespace-nowrap');
        }
    });

    it('opens the emailed code tab from Forgot it', () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Forgot it?' }));
        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    });
});

describe('the pre-auth instance card on the login page', () => {
    it('shows reachability only, nothing from inside the tenant', () => {
        listed = ['password', 'email-code'];
        render(<LoginPage />);
        const card = screen.getByTestId('instance-card');
        expect(card).toHaveTextContent('Reachable · 42 ms');
        expect(card.textContent).not.toMatch(/module|barakoCMS\s*\d|\d+\.\d+\.\d+/i);
    });
});
