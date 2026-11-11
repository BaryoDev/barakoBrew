import { BrandBean, BrandWordmark } from '@/components/brand';
import type { Reachability } from '@/hooks/use-instance-reachability';
import { InstanceCard } from './instance-card';

/** The navy half of the split layout. Hidden below 900px, where the page shows a compact header. */
export function BrandPanel({ host, reachability }: { host: string | null; reachability: Reachability | undefined }) {
    return (
        <aside className="hidden min-h-svh flex-col justify-between bg-[#14162a] p-14 text-[#eeeff8] min-[900px]:flex min-[900px]:w-[45%] min-[900px]:max-w-[656px]">
            <div className="flex items-center gap-3">
                <BrandBean className="size-7" decorative />
                <BrandWordmark className="text-[#eeeff8] [&>span]:text-[#9c8df5]" />
            </div>

            <div>
                <div className="flex items-center gap-5">
                    <BrandBean className="size-[72px] shrink-0" decorative />
                    <h2 className="font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">
                        Know what your site is doing before anyone asks.
                    </h2>
                </div>
                <p className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-[#b5b9d6]">
                    The console for barakoCMS. Everything you do here is a call to your own instance. It
                    shows you what happened and asks you only when a decision needs a person.
                </p>
            </div>

            <InstanceCard host={host} reachability={reachability} />
        </aside>
    );
}
