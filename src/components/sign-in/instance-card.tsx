'use client';

import { useRef } from 'react';
import type { Reachability } from '@/hooks/use-instance-reachability';
import type { RememberedInstance } from '@/lib/remembered-instance';
import { relativeTime } from '@/lib/relative-time';

/**
 * The words for the reachability line, split so only the state word is announced. The time changes
 * on every 30 second recheck and would be read out each time if it were live.
 */
export function reachabilityLabel(state: Reachability | undefined): { word: string; detail: string } {
    if (!state) return { word: 'Checking…', detail: '' };
    if (!state.reachable) return { word: 'Unreachable', detail: '' };
    return { word: 'Reachable', detail: state.ms === null ? '' : ` · ${state.ms} ms` };
}

/** Two letters for the tile, from the first label of the host. */
export function hostInitials(host: string | null): string {
    const first = (host ?? '').split(/[.:]/)[0].replace(/[^a-z0-9]/gi, '');
    return (first.slice(0, 2) || '··').toUpperCase();
}

/** Two letters for the tile, from a tenant's display name: its first two words, else its first two letters. */
export function nameInitials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
    return letters.toUpperCase() || '··';
}

/** "barakoCMS 5.1.0 · 16 modules", whichever parts are known. Empty when none is. */
export function factsLine(r: Pick<RememberedInstance, 'version' | 'modules'>): string {
    const parts: string[] = [];
    if (r.version) parts.push(`barakoCMS ${r.version}`);
    if (r.modules !== null) parts.push(`${r.modules} ${r.modules === 1 ? 'module' : 'modules'}`);
    return parts.join(' · ');
}

/**
 * "You are signing in to", on the brand panel.
 *
 * A first visit knows the host the console was pointed at and whether it answers, and nothing else:
 * the tenant name, version and module count are not anyone's to read before they have proved who
 * they are. A browser that has signed in to this host before kept those facts itself, like a
 * remembered login, and passes them as `remembered` with a way to forget them. Nothing here fetches
 * them (BaryoDev/barakoBrew#268).
 */
export function InstanceCard({
    host,
    reachability,
    remembered,
    onForget,
    now,
}: {
    host: string | null;
    reachability: Reachability | undefined;
    remembered?: RememberedInstance | null;
    onForget?: () => void;
    now?: Date;
}) {
    const up = reachability?.reachable === true;
    const down = reachability?.reachable === false;
    const label = reachabilityLabel(reachability);
    const known = remembered ?? null;
    // The Forget button goes away when it is used, so focus moves to the card's label rather than
    // falling to the page.
    const headingRef = useRef<HTMLParagraphElement>(null);
    const initials = known?.name ? nameInitials(known.name) : hostInitials(host);
    const facts = known ? factsLine(known) : '';
    return (
        <div
            data-testid="instance-card"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-[18px] text-[#eeeff8]"
        >
            <p ref={headingRef} tabIndex={-1} className="text-[11px] font-bold outline-none tracking-[0.08em] text-[#9a9fc0] uppercase">
                You are signing in to
            </p>
            <div className="mt-3 flex items-center gap-3">
                <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#8e7df5] text-[12px] font-extrabold text-[#0b0c16]"
                >
                    {initials}
                </span>
                <span className="min-w-0 flex-1">
                    {known?.name ? <span className="block truncate text-[14px] font-semibold">{known.name}</span> : null}
                    <span className="block truncate font-mono text-[13px]">{host ?? ' '}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-[#c8cbe3]">
                    <span
                        aria-hidden
                        className={
                            'size-2 rounded-full ' +
                            (up ? 'bg-[#4fd1b4]' : down ? 'bg-[#ff8a80]' : 'bg-[#8d91b0]')
                        }
                    />
                    <span>
                        <span role="status">{label.word}</span>
                        {label.detail}
                    </span>
                </span>
            </div>
            {known ? (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[12.5px] text-[#c8cbe3]">
                    <span className="min-w-0">
                        {facts ? <span className="block truncate">{facts}</span> : null}
                        <span className="block text-[#9a9fc0]">Last seen {relativeTime(known.seenAt, now)}</span>
                    </span>
                    {onForget ? (
                        <button
                            type="button"
                            onClick={() => {
                                onForget();
                                headingRef.current?.focus();
                            }}
                            className="shrink-0 font-semibold text-[#b9aeff] hover:underline max-[999px]:min-h-11 max-[999px]:min-w-11"
                        >
                            Forget this browser
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
