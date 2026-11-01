'use client';

import { createElement, useEffect, useMemo, useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  IconAnalytics,
  IconArchive,
  IconBolt,
  IconCoins,
  IconContent,
  IconContentTypes,
  IconCube,
  IconDatabase,
  IconEnvelope,
  IconFlag,
  IconHealth,
  IconKey,
  IconMobile,
  IconSettings,
  IconShield,
  IconTable,
  IconTasks,
  IconUsers,
  IconWebhook,
  IconWorkflows,
} from '@/components/icons';
import {
  customIconSnapshot,
  publishCustomIcons,
  reserveCustomIcon,
  subscribeCustomIcons,
  type IconNode,
} from '@/lib/custom-icon';
import type { ContentTypeIcon } from '@/types/schema';

type GlyphProps = SVGProps<SVGSVGElement>;

export interface Glyph {
  /** The sprite id stored on the type. */
  name: string;
  label: string;
  Icon: ComponentType<GlyphProps>;
}

/** The glyphs a type can be given, in the order the picker shows them. */
export const TYPE_GLYPHS: readonly Glyph[] = [
  { name: 'ic-content-types', label: 'Content types', Icon: IconContentTypes },
  { name: 'ic-content', label: 'Document', Icon: IconContent },
  { name: 'ic-workflows', label: 'Workflow', Icon: IconWorkflows },
  { name: 'ic-users', label: 'People', Icon: IconUsers },
  { name: 'ic-health', label: 'Heart', Icon: IconHealth },
  { name: 'ic-settings', label: 'Gear', Icon: IconSettings },
  { name: 'ic-envelope', label: 'Envelope', Icon: IconEnvelope },
  { name: 'ic-webhook', label: 'Webhook', Icon: IconWebhook },
  { name: 'ic-tasks', label: 'Tasks', Icon: IconTasks },
  { name: 'ic-bolt', label: 'Bolt', Icon: IconBolt },
  { name: 'ic-shield', label: 'Shield', Icon: IconShield },
  { name: 'ic-key', label: 'Key', Icon: IconKey },
  { name: 'ic-database', label: 'Database', Icon: IconDatabase },
  { name: 'ic-archive', label: 'Archive', Icon: IconArchive },
  { name: 'ic-cube', label: 'Cube', Icon: IconCube },
  { name: 'ic-table', label: 'Table', Icon: IconTable },
  { name: 'ic-flag', label: 'Flag', Icon: IconFlag },
  { name: 'ic-mobile', label: 'Phone', Icon: IconMobile },
  { name: 'ic-analytics', label: 'Chart', Icon: IconAnalytics },
  { name: 'ic-coins', label: 'Coins', Icon: IconCoins },
];

const REACT_ATTR: Record<string, string> = { 'fill-rule': 'fillRule', 'clip-rule': 'clipRule' };

function build(node: IconNode, key: number): ReactNode {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) props[REACT_ATTR[name] ?? name] = value;
  return createElement(node.tag, props, ...node.children.map(build));
}

const NO_SYMBOLS: ReturnType<typeof customIconSnapshot> = [];

/**
 * Holds the symbols custom icons are drawn from. Mounted once in the shell. Each symbol is a tree
 * rebuilt from the allowlist, so nothing stored is ever written to the page as HTML.
 */
export function CustomIconSprite() {
  const symbols = useSyncExternalStore(subscribeCustomIcons, customIconSnapshot, () => NO_SYMBOLS);
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute" data-custom-icon-sprite="">
      {symbols.map(({ id, icon }) => (
        <symbol key={id} id={id} viewBox={icon.viewBox}>
          {icon.nodes.map(build)}
        </symbol>
      ))}
    </svg>
  );
}

function CustomGlyph({ svg, fallback: Fallback, className }: { svg: string; fallback: ComponentType<GlyphProps>; className?: string }) {
  const id = useMemo(() => reserveCustomIcon(svg), [svg]);
  useEffect(() => {
    publishCustomIcons();
  }, [id]);

  if (!id) return <Fallback className={className} />;
  return (
    <svg width="1em" height="1em" fill="currentColor" aria-hidden="true" className={className}>
      <use href={`#${id}`} />
    </svg>
  );
}

/**
 * A content type's icon. A sprite glyph by name, a custom one through its registered symbol, and
 * the content types glyph for a type with none or one this build does not know.
 */
export function TypeIcon({
  icon,
  className,
  fallback = IconContentTypes,
}: {
  icon: ContentTypeIcon | null | undefined;
  className?: string;
  fallback?: ComponentType<GlyphProps>;
}) {
  if (icon?.svg) return <CustomGlyph svg={icon.svg} fallback={fallback} className={className} />;
  const glyph = icon?.name ? TYPE_GLYPHS.find((g) => g.name === icon.name) : undefined;
  const Glyph = glyph?.Icon ?? fallback;
  return <Glyph className={className} />;
}
