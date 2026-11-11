import type { Reachability } from '@/hooks/use-instance-reachability';

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

/**
 * "You are signing in to", on the brand panel.
 *
 * Before sign in this knows the host the console was pointed at and whether it answers, and nothing
 * else. The props are the whole of what it can show: there is no tenant name, version or module
 * count to pass, because none of that is anyone's to read before they have proved who they are. A
 * signed-in surface can show those; this one cannot (BaryoDev/barakoBrew#268).
 */
export function InstanceCard({ host, reachability }: { host: string | null; reachability: Reachability | undefined }) {
    const up = reachability?.reachable === true;
    const down = reachability?.reachable === false;
    const label = reachabilityLabel(reachability);
    return (
        <div
            data-testid="instance-card"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-[18px] text-[#eeeff8]"
        >
            <p className="text-[11px] font-bold tracking-[0.08em] text-[#9a9fc0] uppercase">
                You are signing in to
            </p>
            <div className="mt-3 flex items-center gap-3">
                <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#8e7df5] text-[12px] font-extrabold text-[#0b0c16]"
                >
                    {hostInitials(host)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{host ?? ' '}</span>
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
        </div>
    );
}
