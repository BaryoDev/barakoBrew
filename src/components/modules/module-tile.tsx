import type { ComponentType, SVGProps } from 'react';
import {
    IconAiMark,
    IconAnalytics,
    IconArchive,
    IconBug,
    IconCoins,
    IconContent,
    IconCube,
    IconDatabase,
    IconEnvelope,
    IconFieldEdit,
    IconFlag,
    IconKey,
    IconMobile,
    IconSend,
    IconShield,
    IconTable,
} from '@/components/icons';
import { moduleGlyph, type ModuleGlyph } from '@/lib/module-catalog';
import { cn } from '@/lib/utils';
import type { ModuleSummary } from '@/types/modules';

export const GLYPH: Record<ModuleGlyph, ComponentType<SVGProps<SVGSVGElement>>> = {
    content: IconContent,
    form: IconFieldEdit,
    archive: IconArchive,
    database: IconDatabase,
    table: IconTable,
    cube: IconCube,
    send: IconSend,
    envelope: IconEnvelope,
    key: IconKey,
    shield: IconShield,
    flag: IconFlag,
    bug: IconBug,
    mobile: IconMobile,
    analytics: IconAnalytics,
    ai: IconAiMark,
    coins: IconCoins,
};

/**
 * The 44px icon tile. A first-party module gets its own glyph; everything else, including every
 * community package on Browse, gets the generic cube. Never an image from a URL somebody supplied.
 */
export function ModuleTile({
    module,
    muted = false,
    className,
}: {
    module?: Pick<ModuleSummary, 'name' | 'packageId' | 'glyph'>;
    muted?: boolean;
    className?: string;
}) {
    const Glyph = GLYPH[module ? moduleGlyph(module) : 'cube'];
    return (
        <span
            data-testid="module-tile"
            aria-hidden
            className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-[10px]',
                muted ? 'bg-secondary text-muted-foreground' : 'bg-accent text-accent-foreground',
                className,
            )}
        >
            <Glyph className="size-6" />
        </span>
    );
}
