/**
 * Readers for the two replies a QR approval talks about: the one that opens a request and the one
 * that reports on it. Both come from the API, so each is read as `unknown` and refused when it is
 * not the documented shape. Null means "not readable", and the panel shows its network error state.
 */

import type { SignInTokens } from '@/components/sign-in/types';

export type QrPollStatus = 'pending' | 'scanned' | 'approved' | 'denied' | 'expired';

export interface QrCreateReply {
    /** Exactly what the QR encodes. The server chose it, and it is never the browser secret. */
    qrPayload: string;
    /** The number to compare with the one on the phone. Digits only, drawn as text. */
    matchNumber: string;
    /** Held in memory and sent in a poll body. Never stored, never in a URL, never in the QR. */
    secret: string;
    requestId: string | null;
    expiresInSeconds: number;
    intervalSeconds: number | null;
}

export interface QrPollReply {
    status: QrPollStatus;
    tokens: SignInTokens | null;
    intervalSeconds: number | null;
}

const STATUSES: readonly QrPollStatus[] = ['pending', 'scanned', 'approved', 'denied', 'expired'];

/** Longest request lifetime the panel will count down, so a bad reply cannot park a loop for days. */
export const MAX_EXPIRY_SECONDS = 3600;

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): string | null {
    return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function seconds(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function readQrCreate(value: unknown): QrCreateReply | null {
    const body = record(value);
    if (!body) return null;
    const qrPayload = text(body.qrPayload, 2048);
    const secret = text(body.secret, 512);
    const expiresInSeconds = seconds(body.expiresInSeconds);
    const rawNumber = typeof body.matchNumber === 'number' ? String(body.matchNumber) : body.matchNumber;
    const matchNumber = text(rawNumber, 10);
    if (!qrPayload || !secret || !expiresInSeconds || !matchNumber || !/^[0-9]+$/.test(matchNumber)) return null;
    if (qrPayload.includes(secret)) return null;
    return {
        qrPayload,
        matchNumber,
        secret,
        requestId: text(body.requestId, 128),
        expiresInSeconds: Math.min(expiresInSeconds, MAX_EXPIRY_SECONDS),
        intervalSeconds: seconds(body.intervalSeconds),
    };
}

export function readQrPoll(value: unknown): QrPollReply | null {
    const body = record(value);
    if (!body || typeof body.status !== 'string') return null;
    const status = body.status.trim().toLowerCase() as QrPollStatus;
    if (!STATUSES.includes(status)) return null;
    let tokens: SignInTokens | null = null;
    if (status === 'approved') {
        // An approval with no token is not a session.
        const token = text(body.token, 8192);
        if (!token) return null;
        tokens = { token };
        const refreshToken = text(body.refreshToken, 8192);
        if (refreshToken) tokens.refreshToken = refreshToken;
    }
    return { status, tokens, intervalSeconds: seconds(body.intervalSeconds) };
}
