import type { LifecycleDefinition } from '@/types/schema';

const BOX_W = 96;
const BOX_H = 28;
const GAP = 40;

/** States as boxes in order, transitions as arrows between them. Plain SVG, no dependency. */
export function LifecycleDiagram({ lifecycle }: { lifecycle: LifecycleDefinition }) {
    const { states, initialState, transitions } = lifecycle;
    if (states.length === 0) return null;

    const index = (name: string) => states.findIndex((s) => s.toLowerCase() === name.toLowerCase());
    const width = states.length * BOX_W + (states.length - 1) * GAP;
    const arcs = transitions.filter((t) => index(t.from) >= 0 && index(t.to) >= 0 && index(t.from) !== index(t.to));
    const height = BOX_H + 24 + Math.min(arcs.length, 6) * 14 + 16;
    const x = (i: number) => i * (BOX_W + GAP);

    return (
        <svg
            role="img"
            aria-label={`Lifecycle diagram: ${states.join(', ')}`}
            viewBox={`0 0 ${Math.max(width, BOX_W)} ${height}`}
            className="h-auto w-full max-w-full"
        >
            <defs>
                <marker id="lc-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" className="fill-muted-foreground" />
                </marker>
            </defs>
            {states.map((state, i) => (
                <g key={state}>
                    <rect
                        x={x(i)}
                        y={8}
                        width={BOX_W}
                        height={BOX_H}
                        rx={6}
                        className={
                            state.toLowerCase() === initialState.toLowerCase()
                                ? 'fill-primary/10 stroke-primary'
                                : 'fill-background stroke-border'
                        }
                    />
                    <text
                        x={x(i) + BOX_W / 2}
                        y={8 + BOX_H / 2 + 4}
                        textAnchor="middle"
                        className="fill-foreground text-[11px]"
                    >
                        {state}
                    </text>
                </g>
            ))}
            {arcs.slice(0, 6).map((t, n) => {
                const a = index(t.from);
                const b = index(t.to);
                const y = 8 + BOX_H + 8 + n * 14;
                const x1 = x(a) + BOX_W / 2;
                const x2 = x(b) + BOX_W / 2;
                return (
                    <g key={`${t.name}-${n}`}>
                        <path
                            d={`M${x1} ${8 + BOX_H} V${y} H${x2} V${8 + BOX_H + 2}`}
                            fill="none"
                            className="stroke-muted-foreground"
                            markerEnd="url(#lc-arrow)"
                        />
                        <text x={(x1 + x2) / 2} y={y - 2} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                            {t.name}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}
