import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ModuleCardQuestion } from '@/lib/module-cards';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { CardQuestion, trimTurns } = await import('./card-question');

const base: ModuleCardQuestion = { route: '/api/weather/question', placeholder: 'Type a question', maxLength: 50, maxTurns: 6 };
const bomb = '<img src=x onerror=alert(1)>';

function httpError(status: number, headers: Record<string, string> = {}) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers,
        config: { headers: new AxiosHeaders() },
    });
}

const reply = (over: Record<string, unknown> = {}) => ({ data: { answer: 'About 40 mm.', refused: false, ...over } });
const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(box(), { target: { value } });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));
const bodyOf = (call: number) => vi.mocked(api.post).mock.calls[call][1] as { question: string; turns: { role: string; text: string }[]; timeZone: string };

async function submit(text: string) {
    type(text);
    send();
    await screen.findByText(text);
}

beforeEach(() => {
    vi.mocked(api.post).mockReset();
});

describe('CardQuestion', () => {
    it('sends the question, the answered turns and the browser zone', async () => {
        vi.mocked(api.post).mockResolvedValue(reply());
        render(<CardQuestion question={base} tenantId="cafe" />);
        await submit('How much rain fell?');
        expect(api.post).toHaveBeenCalledWith(
            '/api/weather/question',
            { question: 'How much rain fell?', turns: [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            { skipAuthRefresh: true },
        );
        vi.mocked(api.post).mockResolvedValue(reply({ answer: 'Less than last week.' }));
        await submit('And compared to last week?');
        expect(bodyOf(1).turns).toEqual([
            { role: 'user', text: 'How much rain fell?' },
            { role: 'assistant', text: 'About 40 mm.' },
        ]);
    });

    it('sends at most maxTurns and only answered exchanges', async () => {
        render(<CardQuestion question={{ ...base, maxTurns: 2 }} tenantId="cafe" />);
        vi.mocked(api.post).mockResolvedValueOnce(reply({ answer: 'One.' }));
        await submit('first');
        vi.mocked(api.post).mockResolvedValueOnce(reply({ answer: 'Cannot say.', refused: true }));
        await submit('second');
        vi.mocked(api.post).mockRejectedValueOnce(httpError(503));
        type('third');
        send();
        await screen.findByText('Questions are not available right now.');
        vi.mocked(api.post).mockResolvedValueOnce(reply({ answer: 'Three.' }));
        send();
        await screen.findByText('Three.');
        expect(bodyOf(3).turns).toEqual([
            { role: 'user', text: 'first' },
            { role: 'assistant', text: 'One.' },
        ]);
    });

    it('sends no turns when maxTurns is 0', async () => {
        render(<CardQuestion question={{ ...base, maxTurns: 0 }} tenantId="cafe" />);
        vi.mocked(api.post).mockResolvedValue(reply());
        await submit('first');
        await submit('second');
        expect(bodyOf(1).turns).toEqual([]);
    });

    it('keeps the request body under 7 KB by dropping the oldest turns', async () => {
        render(<CardQuestion question={{ ...base, maxLength: 1000, maxTurns: 20 }} tenantId="cafe" />);
        vi.mocked(api.post).mockResolvedValue(reply({ answer: 'z'.repeat(2000) }));
        for (let i = 0; i < 6; i++) await submit(`question ${i}`);
        const last = vi.mocked(api.post).mock.calls.length - 1;
        const body = bodyOf(last);
        expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(7168);
        expect(body.turns.length).toBeGreaterThan(0);
        expect(body.turns.length).toBeLessThan(10);
        expect(body.turns[0].role).toBe('user');
        expect(body.turns.at(-2)?.text).toBe('question 4');
    });

    it('Enter sends and Shift+Enter adds a line', async () => {
        vi.mocked(api.post).mockResolvedValue(reply());
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
        expect(api.post).not.toHaveBeenCalled();
        fireEvent.keyDown(box(), { key: 'Enter' });
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        await screen.findByText('About 40 mm.');
    });

    it('Enter during IME composition does not send', () => {
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
        expect(api.post).not.toHaveBeenCalled();
    });

    it('disables sending while a request is out', async () => {
        let resolve!: (value: unknown) => void;
        vi.mocked(api.post).mockReturnValue(new Promise((r) => (resolve = r)));
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        fireEvent.keyDown(box(), { key: 'Enter' });
        fireEvent.keyDown(box(), { key: 'Enter' });
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
        send();
        expect(api.post).toHaveBeenCalledTimes(1);
        await act(async () => resolve(reply()));
        await screen.findByText('About 40 mm.');
    });

    it('stops input at maxLength and shows the counter near the end', () => {
        render(<CardQuestion question={base} tenantId="cafe" />);
        expect(box()).toHaveAttribute('maxlength', '50');
        type('x'.repeat(10));
        expect(screen.queryByTestId('card-question-count')).toBeNull();
        type('x'.repeat(200));
        expect(box().value).toHaveLength(50);
        expect(screen.getByTestId('card-question-count')).toHaveTextContent('50 / 50');
    });

    it('429 shows Try again in N seconds, clamps Retry-After to 1..3600 and does not retry', async () => {
        render(<CardQuestion question={base} tenantId="cafe" />);
        vi.mocked(api.post).mockRejectedValueOnce(httpError(429, { 'retry-after': '30' }));
        type('Sunny days?');
        send();
        await screen.findByText('Try again in 30 seconds.');
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(box().value).toBe('Sunny days?');

        vi.mocked(api.post).mockRejectedValueOnce(httpError(429, { 'retry-after': '99999' }));
        send();
        await screen.findByText('Try again in 3600 seconds.');

        vi.mocked(api.post).mockRejectedValueOnce(httpError(429, { 'retry-after': '0' }));
        send();
        await screen.findByText('Try again in 1 second.');

        vi.mocked(api.post).mockRejectedValueOnce(httpError(429));
        send();
        await screen.findByText('Try again shortly.');
        expect(api.post).toHaveBeenCalledTimes(4);
    });

    it.each([400, 413])('%s shows the too-long message and keeps the question', async (status) => {
        vi.mocked(api.post).mockRejectedValue(httpError(status));
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        send();
        await screen.findByText('That was too long. Clear the conversation and try again.');
        expect(box().value).toBe('Sunny days?');
    });

    it.each([401, 403, 404, 503])('%s shows the not-available message and keeps the question', async (status) => {
        vi.mocked(api.post).mockRejectedValue(httpError(status));
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        send();
        await screen.findByText('Questions are not available right now.');
        expect(box().value).toBe('Sunny days?');
    });

    it('a network error shows the not-available message and keeps the question', async () => {
        vi.mocked(api.post).mockRejectedValue(new Error('offline'));
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        send();
        await screen.findByText('Questions are not available right now.');
        expect(box().value).toBe('Sunny days?');
    });

    it('an answer with no text shows the not-available message', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { answer: '  ', refused: false } });
        render(<CardQuestion question={base} tenantId="cafe" />);
        type('Sunny days?');
        send();
        await screen.findByText('Questions are not available right now.');
    });

    it('draws an answer, a refused answer muted, and source labels, as text', async () => {
        const { container } = render(<CardQuestion question={{ ...base, maxLength: 1000 }} tenantId="cafe" />);
        vi.mocked(api.post).mockResolvedValueOnce(
            reply({
                answer: `${bomb}\nsecond\u202E paragraph\n\n${'x'.repeat(10000)}`,
                sourceLabels: ['Rainfall', bomb],
                sources: ['raw.id'],
                window: { from: '2026-11-19', to: '2026-11-26', zone: 'Asia/Manila' },
            }),
        );
        await submit('How wet was it?');
        expect(screen.getByText(bomb)).toBeInTheDocument();
        expect(screen.getByText('second paragraph')).toBeInTheDocument();
        const long = screen.getByText(/^x+$/);
        expect(long.textContent).toHaveLength(2000 - bomb.length - 'second paragraph'.length - 3);
        expect(screen.getByText(`From: Rainfall, ${bomb}. Nov 19 to Nov 26`)).toBeInTheDocument();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();

        vi.mocked(api.post).mockResolvedValueOnce(reply({ answer: 'Not something I can say.', refused: true, sources: ['weather.now'] }));
        await submit('refused one');
        expect(screen.getByText('Not something I can say.').parentElement).toHaveClass('text-muted-foreground');
        expect(screen.getByText('From: weather.now')).toBeInTheDocument();
    });

    it('Clear empties the conversation', async () => {
        vi.mocked(api.post).mockResolvedValue(reply());
        render(<CardQuestion question={base} tenantId="cafe" />);
        await submit('Sunny days?');
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(screen.queryByText('Sunny days?')).toBeNull();
        expect(screen.queryByText('About 40 mm.')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });

    it('a tenant switch clears the conversation and ignores a late answer', async () => {
        vi.mocked(api.post).mockResolvedValueOnce(reply({ answer: 'Cafe answer.' }));
        const view = render(<CardQuestion question={base} tenantId="cafe" />);
        await submit('first');
        let resolve!: (value: unknown) => void;
        vi.mocked(api.post).mockReturnValueOnce(new Promise((r) => (resolve = r)));
        type('second');
        send();
        view.rerender(<CardQuestion question={base} tenantId="bistro" />);
        expect(screen.queryByText('Cafe answer.')).toBeNull();
        expect(screen.queryByText('first')).toBeNull();
        expect(box().value).toBe('');
        await act(async () => resolve(reply({ answer: 'Late answer.' })));
        expect(screen.queryByText('Late answer.')).toBeNull();
        expect(screen.queryByText('second')).toBeNull();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
        type('third');
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    });

    it('answers land in an aria-live polite region', async () => {
        vi.mocked(api.post).mockResolvedValue(reply());
        render(<CardQuestion question={base} tenantId="cafe" />);
        await submit('Sunny days?');
        expect(screen.getByText('About 40 mm.').closest('[aria-live="polite"]')).not.toBeNull();
    });
});

describe('trimTurns', () => {
    const turn = (role: 'user' | 'assistant', text: string) => ({ role, text });
    const pair = (n: number, size = 10) => [turn('user', `q${n}${'x'.repeat(size)}`), turn('assistant', `a${n}${'y'.repeat(size)}`)];

    it('keeps the newest maxTurns', () => {
        const turns = [...pair(1), ...pair(2), ...pair(3)];
        expect(trimTurns(turns, 2)).toEqual(pair(3));
        expect(trimTurns(turns, 0)).toEqual([]);
        expect(trimTurns(turns, 20)).toEqual(turns);
    });

    it('drops the oldest until the body is under 7 KB', () => {
        const turns = [...pair(1, 3000), ...pair(2, 3000), ...pair(3, 3000)];
        const kept = trimTurns(turns, 20, 7168, { question: 'next', timeZone: 'Asia/Manila' });
        expect(kept).toEqual(pair(3, 3000));
        const body = JSON.stringify({ question: 'next', turns: kept, timeZone: 'Asia/Manila' });
        expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(7168);
    });

    it('counts bytes, not characters', () => {
        const wide = [turn('user', '\u00e9'.repeat(2000)), turn('assistant', '\u00e9'.repeat(2000)), ...pair(2, 5)];
        expect(trimTurns(wide, 20, 7168)).toEqual(wide.slice(2));
        expect(trimTurns(wide, 20, 9000)).toEqual(wide);
    });

    it('never starts with a reply that lost its question', () => {
        const turns = [...pair(1), ...pair(2), ...pair(3)];
        expect(trimTurns(turns, 3)).toEqual(pair(3));
    });
});
