import { BrandBean, BrandWordmark } from '@/components/brand';
import type { Reachability } from '@/hooks/use-instance-reachability';
import type { RememberedInstance } from '@/lib/remembered-instance';
import { InstanceCard } from './instance-card';

/**
 * The half of the split layout on the --code surface, which goes darker in the dark theme. Hidden
 * below 900px, where the page shows a compact header.
 */
export function BrandPanel({
    host,
    reachability,
    remembered,
    onForget,
}: {
    host: string | null;
    reachability: Reachability | undefined;
    remembered?: RememberedInstance | null;
    onForget?: () => void;
}) {
    return (
        <aside className="sticky top-0 hidden h-svh flex-col justify-between bg-[var(--code)] px-[clamp(28px,4vw,64px)] py-8 text-[#eeeff8] min-[900px]:flex min-[900px]:w-[45%] min-[900px]:max-w-[656px]">
            <div className="flex items-center gap-3">
                <BrandBean className="size-7" decorative />
                <BrandWordmark className="text-[#eeeff8] [&>span]:text-[#b9aeff]" />
            </div>

            <div>
                <div className="flex items-center gap-5">
                    <BrandBean className="size-16 shrink-0" decorative />
                    <h2 className="font-display text-[clamp(26px,2.8vw,38px)] leading-[1.05] font-semibold tracking-[-0.03em]">
                        Know what your site is doing before anyone asks.
                    </h2>
                </div>
                <p className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-[#b5b9d6]">
                    The console for barakoCMS. Everything you do here is a call to your own instance;
                    it shows you what happened and asks you only when a decision needs a person.
                </p>
            </div>

            <InstanceCard host={host} reachability={reachability} remembered={remembered} onForget={onForget} />
        </aside>
    );
}
