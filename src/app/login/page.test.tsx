import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let listed: string[] | undefined;
const loginMutate = vi.fn();
const verifyMutate = vi.fn();
const requestMutate = vi.fn();
const mutation = (mutate: typeof loginMutate) => () => ({ mutate, isPending: false });

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ isAuthenticated: false, isLoading: false }),
    useLogin: mutation(loginMutate),
    useVerifyMfa: mutation(vi.fn()),
    useVerifyDeviceCode: mutation(verifyMutate),
    useRequestSignInCode: mutation(requestMutate),
}));
vi.mock('@/hooks/use-auth-providers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/hooks/use-auth-providers')>()),
    useAuthProviders: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-sign-in-methods', () => ({ useSignInMethods: () => ({ data: listed, isError: false }) }));
vi.mock('@/hooks/use-instance-reachability', () => ({
    useInstanceReachability: () => ({ data: { reachable: true, ms: 42 } }),
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const { default: LoginPage } = await import('./page');
const { registerSignInMethod, SIGN_IN_METHODS } = await import('@/components/sign-in/registry');

describe('sign-in method tabs', () => {
    beforeEach(() => {
        listed = ['password', 'email-code'];
        delete SIGN_IN_METHODS['scan-qr'];
        loginMutate.mockReset();
        verifyMutate.mockReset();
        requestMutate.mockReset();
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
});

describe('Forgot it', () => {
    beforeEach(() => {
        listed = ['password', 'email-code'];
    });

    it('opens the emailed code tab and puts focus in its field', () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Forgot it?' }));
        const field = screen.getByLabelText('Email address');
        expect(field).toBeInTheDocument();
        expect(field).toHaveFocus();
    });

    it('is not drawn when the server lists only password, since it would go nowhere', () => {
        listed = ['password'];
        render(<LoginPage />);
        expect(screen.queryByRole('button', { name: 'Forgot it?' })).toBeNull();
    });
});

describe('what was typed', () => {
    it('survives the methods list arriving, which used to remount the form', () => {
        listed = undefined;
        const { rerender } = render(<LoginPage />);
        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana' } });
        fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'hunter2hunter2' } });

        listed = ['password', 'email-code'];
        rerender(<LoginPage />);

        expect(screen.getAllByRole('tab')).toHaveLength(2);
        expect(screen.getByLabelText('Username')).toHaveValue('ana');
        expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('hunter2hunter2');
    });

    it('survives a trip to another tab and back', () => {
        listed = ['password', 'email-code'];
        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana' } });

        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Email code' }));
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ana@cafe.example' } });
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Password' }));
        expect(screen.getByLabelText('Username')).toHaveValue('ana');

        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Email code' }));
        expect(screen.getByLabelText('Email address')).toHaveValue('ana@cafe.example');
    });
});

describe('the trust note', () => {
    it('is a note, not a control, because the server trusts every verified code', () => {
        listed = ['password', 'email-code'];
        render(<LoginPage />);
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.getByText('Entering the emailed code trusts this browser for 30 days.')).toBeInTheDocument();
    });
});

describe('Email me a code from the authenticator step', () => {
    it('stays on the authenticator step until the code has been sent', () => {
        listed = ['password', 'email-code'];
        loginMutate.mockImplementation((_creds, opts) =>
            opts.onSuccess({ requiresDeviceApproval: true, email: 'ana@cafe.example' })
        );
        verifyMutate.mockImplementation((_input, opts) =>
            opts.onSuccess({ requiresMfa: true, mfaChallengeToken: 'challenge' })
        );
        render(<LoginPage />);

        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana' } });
        fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'correct-password' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        fireEvent.change(screen.getByLabelText('Device approval code'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
        expect(requestMutate).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();

        act(() => requestMutate.mock.calls[0][1].onSuccess({ message: 'sent' }));
        expect(screen.getByLabelText('Sign-in code')).toBeInTheDocument();
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
