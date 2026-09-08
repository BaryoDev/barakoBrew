'use client';

import { useSyncExternalStore } from 'react';
import {
    getContractState,
    getContractServerState,
    isIncompatible,
    subscribeToContract,
    SUPPORTED_CONTRACT,
    type IncompatibleContract,
} from '@/lib/api-contract';

/**
 * Stops the console when the API on the other end is one it cannot drive.
 *
 * Stop rather than warn, deliberately. A console that half-works is worse than one that refuses,
 * because the person using it cannot tell which screens are lying to them. A screen that names both
 * versions and says which to change is a support ticket avoided rather than caused.
 *
 * Wrapped around everything including the sign-in page, which is possible because the API sends its
 * contract version on every response, 401s included. Telling somebody their console does not fit
 * only after they have found their password is a poor trade.
 */
export function ContractGate({ children }: { children: React.ReactNode }) {
    const state = useSyncExternalStore(subscribeToContract, getContractState, getContractServerState);

    if (!isIncompatible(state)) return <>{children}</>;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center p-6">
            <div
                role="alert"
                className="bg-card w-full max-w-lg rounded-2xl border p-8 shadow-sm"
            >
                <p className="text-muted-foreground font-mono text-[11px] tracking-[0.14em] uppercase">
                    Cannot start
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight">{headline(state)}</h1>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{explain(state)}</p>

                <dl className="bg-muted/50 mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl p-4 font-mono text-xs">
                    <dt className="text-muted-foreground">This console speaks</dt>
                    <dd className="tabular-nums">{describeRange()}</dd>
                    <dt className="text-muted-foreground">The API speaks</dt>
                    <dd className="tabular-nums">
                        {state.kind === 'absent' ? 'no contract version at all' : state.version}
                    </dd>
                </dl>

                <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
                    Nothing has been changed. The console stops here rather than showing screens that
                    would be wrong in ways you could not see.
                </p>
            </div>
        </div>
    );
}

function describeRange() {
    return SUPPORTED_CONTRACT.min === SUPPORTED_CONTRACT.max
        ? String(SUPPORTED_CONTRACT.min)
        : `${SUPPORTED_CONTRACT.min} to ${SUPPORTED_CONTRACT.max}`;
}

function headline(state: IncompatibleContract) {
    switch (state.kind) {
        case 'api-older':
            return 'This API is older than this console';
        case 'api-newer':
            return 'This API is newer than this console';
        default:
            return 'This API is too old for this console';
    }
}

function explain(state: IncompatibleContract) {
    switch (state.kind) {
        case 'api-older':
            return 'The console was upgraded and the API was not. Upgrade the API, or run the console version that was released alongside it.';
        case 'api-newer':
            return 'The API was upgraded and the console was not. Upgrade the console, which is the half that moves to match.';
        default:
            // Absent. Not a fault, and worth saying plainly rather than showing a blank.
            return 'The API did not report a contract version, which means it predates the version that started reporting one. Upgrade the API.';
    }
}
