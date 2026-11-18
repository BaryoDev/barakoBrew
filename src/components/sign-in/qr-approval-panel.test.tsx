import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const encoded: string[] = [];
vi.mock('qrcode', async (importOriginal) => {
    const actual = await importOriginal<{ default: typeof import('qrcode') }>();
    return {
        default: {
            ...actual.default,
            create: (text: string, options?: object) => {
                encoded.push(text);
                return actual.default.create(text, options as never);
            },
        },
    };
});

const { QrApprovalPanel } = await import('./qr-approval-panel');

const CREATE = {
    qrPayload: 'request:r1',
    matchNumber: '482913',
    secret: 'browser-secret-xyz',
    requestId: 'r1',
    expiresInSeconds: 120,
    intervalSeconds: 2,
};

function setup(overrides: Record<string, unknown> = {}) {
    const create = vi.fn().mockResolvedValue({ ...CREATE, ...overrides });
    const poll = vi.fn().mockResolvedValue({ status: 'pending' });
    const completeSession = vi.fn();
    const view = render(<QrApprovalPanel flow={{ completeSession }} api={{ create, poll }} />);
    return { create, poll, completeSession, ...view };
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const flush = () => act(async () => {});

beforeEach(() => {
    vi.useFakeTimers();
    encoded.length = 0;
    localStorage.clear();
    sessionStorage.clear();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('QrApprovalPanel', () => {
    it('draws_the_qr_and_number_from_the_create_reply', async () => {
        setup();
        await flush();

        expect(screen.getByRole('img', { name: /QR code/i })).toBeInTheDocument();
        expect(screen.getByText('482913')).toBeInTheDocument();
        expect(screen.getByText(/Expires in 2:00/)).toBeInTheDocument();
        expect(encoded).toEqual(['request:r1']);
        expect(screen.getByRole('status')).toHaveTextContent(/scan this code/i);
        expect(screen.queryByLabelText(/password/i)).toBeNull();
    });

    it('does_not_put_the_browser_secret_in_the_qr_or_in_storage', async () => {
        const { poll } = setup();
        await flush();
        await advance(2000);

        expect(poll).toHaveBeenCalledWith({ secret: 'browser-secret-xyz', requestId: 'r1' });
        expect(encoded.length).toBeGreaterThan(0);
        expect(encoded.every((text) => !text.includes('browser-secret-xyz'))).toBe(true);
        expect(document.body.innerHTML).not.toContain('browser-secret-xyz');
        expect(JSON.stringify({ ...localStorage })).not.toContain('browser-secret-xyz');
        expect(JSON.stringify({ ...sessionStorage })).not.toContain('browser-secret-xyz');
    });

    it('shows_scanned_then_signs_in_on_approval', async () => {
        const { poll, completeSession } = setup();
        await flush();
        poll.mockResolvedValueOnce({ status: 'scanned' });
        await advance(2000);
        expect(screen.getByRole('status')).toHaveTextContent('Scanned. Approve the sign-in on your phone.');
        expect(completeSession).not.toHaveBeenCalled();

        poll.mockResolvedValueOnce({ status: 'approved', token: 'session-token', refreshToken: 'r' });
        await advance(2000);

        expect(completeSession).toHaveBeenCalledTimes(1);
        expect(completeSession).toHaveBeenCalledWith({ token: 'session-token', refreshToken: 'r' });
        expect(screen.getByRole('status')).toHaveTextContent('Approved. Signing you in.');
    });

    it('shows_denied', async () => {
        const { poll, completeSession } = setup();
        await flush();
        poll.mockResolvedValueOnce({ status: 'denied' });
        await advance(2000);

        expect(screen.getByRole('status')).toHaveTextContent('The sign-in was denied on your phone.');
        expect(screen.queryByRole('img')).toBeNull();
        expect(completeSession).not.toHaveBeenCalled();
        const calls = poll.mock.calls.length;
        await advance(10_000);
        expect(poll).toHaveBeenCalledTimes(calls);
    });

    it('shows_expired_and_offers_a_new_code', async () => {
        const { create, poll } = setup({ expiresInSeconds: 3 });
        await flush();
        await advance(3000);

        expect(screen.getByRole('status')).toHaveTextContent('This code has expired.');
        const again = screen.getByRole('button', { name: 'Show a new code' });
        const polled = poll.mock.calls.length;
        await advance(10_000);
        expect(poll).toHaveBeenCalledTimes(polled);

        create.mockResolvedValue({ ...CREATE, matchNumber: '777000', expiresInSeconds: 120 });
        fireEvent.click(again);
        await flush();
        expect(create).toHaveBeenCalledTimes(2);
        expect(screen.getByText('777000')).toBeInTheDocument();
    });

    it('stops_polling_on_unmount', async () => {
        const { poll, unmount } = setup();
        await flush();
        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(1);

        unmount();
        await advance(20_000);
        expect(poll).toHaveBeenCalledTimes(1);
    });

    it('does_not_start_a_second_poll_while_one_is_open', async () => {
        const { poll } = setup();
        await flush();
        poll.mockImplementation(() => new Promise(() => {}));
        await advance(2000);
        await advance(30_000);

        expect(poll).toHaveBeenCalledTimes(1);
    });

    it('a_reply_without_a_token_is_not_a_session', async () => {
        const { poll, completeSession } = setup();
        await flush();
        poll.mockResolvedValueOnce({ status: 'approved' });
        await advance(2000);

        expect(completeSession).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toHaveTextContent('Could not reach the server.');
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('shows_an_error_when_the_code_cannot_be_drawn', async () => {
        const { poll, create } = setup({ qrPayload: '\u00e9'.repeat(1300) });
        await flush();

        expect(screen.getByRole('status')).toHaveTextContent('This code could not be drawn.');
        expect(screen.queryByRole('img')).toBeNull();
        await advance(10_000);
        expect(poll).not.toHaveBeenCalled();

        create.mockResolvedValue(CREATE);
        const again = screen.getByRole('button', { name: 'Show a new code' });
        fireEvent.click(again);
        expect(screen.getByRole('status')).toHaveFocus();
        await flush();
        expect(screen.getByRole('img', { name: /QR code/i })).toBeInTheDocument();
    });

    it('moves_focus_to_the_status_line_after_try_again', async () => {
        const { create } = setup({ matchNumber: 'bad' });
        await flush();
        create.mockResolvedValue(CREATE);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(screen.getByRole('status')).toHaveFocus();
    });

    it('shows_the_network_error_for_a_malformed_create_reply_and_retries', async () => {
        const { create } = setup({ matchNumber: 'not a number' });
        await flush();
        expect(screen.getByRole('status')).toHaveTextContent('Could not reach the server.');
        expect(screen.queryByRole('img')).toBeNull();

        create.mockResolvedValue(CREATE);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await flush();
        expect(screen.getByText('482913')).toBeInTheDocument();
    });
});
