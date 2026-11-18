'use client';

import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { readQrCreate, readQrPoll } from '@/lib/qr-approval';
import type { SignInTokens } from '@/components/sign-in/types';

/** The server's interval is honoured, but never below this. */
export const POLL_FLOOR_MS = 1000;
const DEFAULT_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 30_000;

export type QrApprovalPhase = 'creating' | 'waiting' | 'scanned' | 'approved' | 'denied' | 'expired' | 'error';

export interface QrRequestView {
    /** What the QR encodes, as the server said. */
    qrPayload: string;
    matchNumber: string;
    /** Epoch milliseconds. */
    expiresAt: number;
}

export interface QrApprovalState {
    phase: QrApprovalPhase;
    request: QrRequestView | null;
}

/** How to open a request and how to ask about it. Replies are parsed by the hook, not here. */
export interface QrApprovalApi {
    create(): Promise<unknown>;
    poll(input: { secret: string; requestId: string | null }): Promise<unknown>;
}

/**
 * The two calls for a pair of routes. The secret goes in the poll body, never the path or query,
 * so it stays out of access logs and referrers.
 */
export function createQrApprovalApi(routes: { createPath: string; pollPath: string }): QrApprovalApi {
    return {
        create: async () => (await api.post<unknown>(routes.createPath, {})).data,
        poll: async ({ secret, requestId }) =>
            (await api.post<unknown>(routes.pollPath, requestId ? { secret, requestId } : { secret })).data,
    };
}

function retryAfterMs(error: unknown): number {
    const header = isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

interface Held {
    secret: string;
    requestId: string | null;
    expiresAt: number;
}

/**
 * One request and its polling loop. Each run has a number, and anything an older run was waiting on
 * is dropped when it lands. At most one poll is open at a time, across runs.
 */
export class QrApprovalRun {
    private run = 0;
    private open = false;
    private held: Held | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private expiryTimer: ReturnType<typeof setTimeout> | null = null;
    private intervalMs = DEFAULT_INTERVAL_MS;
    private backoffMs = 0;
    private api: QrApprovalApi | null = null;
    private onApproved: ((tokens: SignInTokens) => void) | null = null;

    constructor(private readonly emit: (state: QrApprovalState) => void) {}

    private view: QrRequestView | null = null;

    configure(api: QrApprovalApi, onApproved: (tokens: SignInTokens) => void) {
        this.api = api;
        this.onApproved = onApproved;
    }

    private set(phase: QrApprovalPhase) {
        this.emit({ phase, request: this.view });
    }

    /** Stop the loop and the expiry timer, and make every pending reply stale. */
    private halt() {
        this.run += 1;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        this.pollTimer = null;
        this.expiryTimer = null;
    }

    /** Unmount, tab switch: nothing runs afterwards, and the secret is dropped. */
    dispose() {
        this.halt();
        this.held = null;
    }

    /** Ask for a new request and start polling it. */
    async start() {
        this.halt();
        this.held = null;
        this.view = null;
        const run = this.run;
        this.set('creating');
        let reply: unknown;
        try {
            reply = await this.api!.create();
        } catch {
            if (run === this.run) this.set('error');
            return;
        }
        if (run !== this.run) return;
        const created = readQrCreate(reply);
        if (!created) {
            this.set('error');
            return;
        }
        const expiresAt = Date.now() + created.expiresInSeconds * 1000;
        this.held = { secret: created.secret, requestId: created.requestId, expiresAt };
        this.view = { qrPayload: created.qrPayload, matchNumber: created.matchNumber, expiresAt };
        this.intervalMs = Math.max(POLL_FLOOR_MS, (created.intervalSeconds ?? DEFAULT_INTERVAL_MS / 1000) * 1000);
        this.backoffMs = 0;
        this.set('waiting');
        this.arm(run);
    }

    /** After a network error: carry on with the same request if it is still live, else ask again. */
    retry() {
        if (this.held && Date.now() < this.held.expiresAt) {
            this.halt();
            this.set('waiting');
            this.arm(this.run);
        } else {
            void this.start();
        }
    }

    private arm(run: number) {
        const held = this.held;
        if (!held) return;
        this.expiryTimer = setTimeout(() => this.finish(run, 'expired'), Math.max(0, held.expiresAt - Date.now()));
        this.schedule(run, this.intervalMs);
    }

    private finish(run: number, phase: 'denied' | 'expired' | 'approved') {
        if (run !== this.run) return;
        this.halt();
        this.held = null;
        this.set(phase);
    }

    private schedule(run: number, delay: number) {
        this.pollTimer = setTimeout(() => void this.tick(run), delay);
    }

    private async tick(run: number) {
        this.pollTimer = null;
        if (run !== this.run || !this.held) return;
        // A poll from an abandoned request may still be open. Wait for it rather than run two.
        if (this.open) {
            this.schedule(run, this.intervalMs);
            return;
        }
        const { secret, requestId } = this.held;
        this.open = true;
        let reply: unknown;
        let failure: unknown = null;
        try {
            reply = await this.api!.poll({ secret, requestId });
        } catch (error) {
            failure = error;
        }
        this.open = false;
        if (run !== this.run) return;

        if (failure) {
            if (isAxiosError(failure) && failure.response?.status === 429) {
                this.backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(this.intervalMs, this.backoffMs) * 2);
                const wait = Math.min(MAX_BACKOFF_MS, Math.max(this.backoffMs, retryAfterMs(failure)));
                this.schedule(run, wait);
                return;
            }
            this.halt();
            this.set('error');
            return;
        }

        const parsed = readQrPoll(reply);
        if (!parsed) {
            this.halt();
            this.set('error');
            return;
        }
        this.backoffMs = 0;
        if (parsed.intervalSeconds) this.intervalMs = Math.max(POLL_FLOOR_MS, parsed.intervalSeconds * 1000);
        if (parsed.status === 'approved' && parsed.tokens) {
            this.finish(run, 'approved');
            this.onApproved?.(parsed.tokens);
            return;
        }
        if (parsed.status === 'denied' || parsed.status === 'expired') {
            this.finish(run, parsed.status);
            return;
        }
        this.set(parsed.status === 'scanned' ? 'scanned' : 'waiting');
        this.schedule(run, this.intervalMs);
    }
}

/**
 * Opens a request on mount and polls it until it is approved, denied or expired. The browser secret
 * stays inside the run and is sent only in the body of a poll. Unmounting stops everything.
 */
export function useQrApproval(approvalApi: QrApprovalApi, onApproved: (tokens: SignInTokens) => void) {
    const [state, setState] = useState<QrApprovalState>({ phase: 'creating', request: null });
    const [run] = useState(() => new QrApprovalRun(setState));

    useEffect(() => {
        run.configure(approvalApi, onApproved);
    });

    useEffect(() => {
        void run.start();
        return () => run.dispose();
    }, [run]);

    return {
        phase: state.phase,
        request: state.request,
        /** Open a new request. */
        showNewCode: () => void run.start(),
        retry: () => run.retry(),
    };
}
