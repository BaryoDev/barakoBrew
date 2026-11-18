'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { useQrApproval, type QrApprovalApi, type QrApprovalPhase } from '@/hooks/use-qr-approval';
import type { SignInFlow } from './types';

export interface QrApprovalText {
    instruction: string;
    matchLabel: string;
    scanned: string;
    approved: string;
    denied: string;
    expired: string;
    error: string;
    creating: string;
    qrName: string;
}

export const DEFAULT_QR_TEXT: QrApprovalText = {
    instruction: 'On your phone, scan this code, then check that the number below matches the one it shows.',
    matchLabel: 'Match number',
    scanned: 'Scanned. Approve the sign-in on your phone.',
    approved: 'Approved. Signing you in.',
    denied: 'The sign-in was denied on your phone.',
    expired: 'This code has expired.',
    error: 'Could not reach the server.',
    creating: 'Getting a code.',
    qrName: 'QR code to scan with your phone',
};

export interface QrApprovalPanelProps {
    /** Only `completeSession` is used: the panel hands tokens to the page and never stores them. */
    flow: Pick<SignInFlow, 'completeSession'>;
    /** How to open a request and how to poll it. The panel names no route of its own. */
    api: QrApprovalApi;
    text?: Partial<QrApprovalText>;
}

const QUIET_ZONE = 4;

/**
 * Draws the modules as one path. Dark modules are `card` on a `card-foreground` ground in dark mode
 * and the reverse in light, so a scanner always sees dark on light.
 */
function QrCode({ value, name }: { value: string; name: string }) {
    const drawing = useMemo(() => {
        try {
            const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
            const size = modules.size;
            let path = '';
            for (let row = 0; row < size; row += 1) {
                for (let col = 0; col < size; col += 1) {
                    if (modules.get(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
                }
            }
            return { path, extent: size + QUIET_ZONE * 2 };
        } catch {
            return null;
        }
    }, [value]);

    if (!drawing) return null;
    return (
        <svg
            role="img"
            aria-label={name}
            viewBox={`0 0 ${drawing.extent} ${drawing.extent}`}
            shapeRendering="crispEdges"
            className="bg-card text-card-foreground dark:bg-card-foreground dark:text-card size-56 rounded-lg border"
        >
            <path d={drawing.path} fill="currentColor" />
        </svg>
    );
}

function format(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function useSecondsLeft(expiresAt: number | null, running: boolean): number | null {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running]);
    return expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function message(phase: QrApprovalPhase, text: QrApprovalText): string {
    switch (phase) {
        case 'creating':
            return text.creating;
        case 'waiting':
            return text.instruction;
        case 'scanned':
            return text.scanned;
        case 'approved':
            return text.approved;
        case 'denied':
            return text.denied;
        case 'expired':
            return text.expired;
        case 'error':
            return text.error;
    }
}

/**
 * A sign-in method that shows a QR and a match number, then polls until a signed-in device approves.
 * No state asks for a password. The browser secret never leaves the hook except in a poll body.
 */
export function QrApprovalPanel({ flow, api, text }: QrApprovalPanelProps) {
    const copy = { ...DEFAULT_QR_TEXT, ...text };
    const { phase, request, showNewCode, retry } = useQrApproval(api, flow.completeSession);
    const live = phase === 'waiting' || phase === 'scanned';
    const secondsLeft = useSecondsLeft(request?.expiresAt ?? null, live);
    const showCode = request !== null && (live || phase === 'approved');

    return (
        <div className="flex flex-col items-center gap-4 text-center">
            {showCode ? (
                <>
                    <QrCode value={request.qrPayload} name={copy.qrName} />
                    <div>
                        <p className="text-muted-foreground text-[12.5px] font-bold">{copy.matchLabel}</p>
                        <p className="font-mono text-4xl font-semibold tracking-widest tabular-nums">
                            {request.matchNumber}
                        </p>
                    </div>
                    {live && secondsLeft !== null ? (
                        <p className="text-muted-foreground text-[13px] tabular-nums">Expires in {format(secondsLeft)}</p>
                    ) : null}
                </>
            ) : null}

            <p
                role="status"
                aria-live="polite"
                className={`text-[13.5px] leading-relaxed ${
                    phase === 'denied' || phase === 'error' ? 'text-destructive' : 'text-muted-foreground'
                }`}
            >
                {message(phase, copy)}
            </p>

            {phase === 'expired' || phase === 'denied' ? (
                <Button type="button" onClick={showNewCode} className="h-11 w-full font-bold">
                    Show a new code
                </Button>
            ) : null}
            {phase === 'error' ? (
                <Button type="button" onClick={retry} className="h-11 w-full font-bold">
                    Try again
                </Button>
            ) : null}
        </div>
    );
}
