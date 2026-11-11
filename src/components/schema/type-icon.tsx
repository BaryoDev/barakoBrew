import { createElement, type ReactNode, type SVGProps } from 'react';
import {
  IconAnalytics,
  IconArchive,
  IconBolt,
  IconCalendar,
  IconCoffee,
  IconCoins,
  IconContent,
  IconCube,
  IconEnvelope,
  IconFlag,
  IconKey,
  IconList,
  IconMobile,
  IconMug,
  IconShield,
  IconTable,
  IconTasks,
  IconText,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { checkSvg, registerIcon, registeredIcon, type IconNode } from '@/lib/icon-svg';
import type { ContentTypeIcon } from '@/types/schema';

type GlyphComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

/** The picker's twenty glyphs, in the design's order, by the sprite id stored as `icon.name`. */
export const TYPE_GLYPHS: { name: string; label: string; render: (props: SVGProps<SVGSVGElement>) => ReactNode }[] = [
  { name: 'ic-content', label: 'Document', render: (p) => <IconContent {...p} /> },
  { name: 'ic-table', label: 'Table', render: (p) => <IconTable {...p} /> },
  { name: 'ic-calendar', label: 'Calendar', render: (p) => <IconCalendar {...p} /> },
  { name: 'ic-coffee', label: 'Coffee', render: (p) => <IconCoffee {...p} /> },
  { name: 'ic-mug', label: 'Mug', render: (p) => <IconMug {...p} /> },
  { name: 'ic-users', label: 'People', render: (p) => <IconUsers {...p} /> },
  { name: 'ic-user', label: 'Person', render: (p) => <IconUser {...p} /> },
  { name: 'ic-envelope', label: 'Envelope', render: (p) => <IconEnvelope {...p} /> },
  { name: 'ic-coins', label: 'Coins', render: (p) => <IconCoins {...p} /> },
  { name: 'ic-flag', label: 'Flag', render: (p) => <IconFlag {...p} /> },
  { name: 'ic-list', label: 'List', render: (p) => <IconList {...p} /> },
  { name: 'ic-text', label: 'Text', render: (p) => <IconText {...p} /> },
  { name: 'ic-archive', label: 'Archive', render: (p) => <IconArchive {...p} /> },
  { name: 'ic-tasks', label: 'Tasks', render: (p) => <IconTasks {...p} /> },
  { name: 'ic-bolt', label: 'Bolt', render: (p) => <IconBolt {...p} /> },
  { name: 'ic-cube', label: 'Cube', render: (p) => <IconCube {...p} /> },
  { name: 'ic-shield', label: 'Shield', render: (p) => <IconShield {...p} /> },
  { name: 'ic-key', label: 'Key', render: (p) => <IconKey {...p} /> },
  { name: 'ic-mobile', label: 'Mobile', render: (p) => <IconMobile {...p} /> },
  { name: 'ic-analytics', label: 'Analytics', render: (p) => <IconAnalytics {...p} /> },
];

const GLYPH_NAMES = new Set(TYPE_GLYPHS.map((g) => g.name));

function drawNode(node: IconNode, key: number): ReactNode {
  return createElement(
    node.tag,
    { key, ...node.attrs, ...(node.tag === 'g' ? {} : { fill: 'currentColor' }) },
    ...node.children.map(drawNode)
  );
}

/** Draws a registered custom symbol as React elements. Nothing here parses or injects markup. */
function CustomIcon({ id, ...props }: { id: string } & SVGProps<SVGSVGElement>) {
  const symbol = registeredIcon(id);
  if (!symbol) return <IconContent {...props} />;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={symbol.viewBox}
      width="1em"
      height="1em"
      aria-hidden
      {...props}
    >
      {symbol.nodes.map(drawNode)}
    </svg>
  );
}

/**
 * The id a content type's icon is drawn from: the sprite id for a glyph, `ic-custom-N` for custom
 * markup, or undefined for none. Stored markup is checked again here before it is registered, so
 * what is drawn never depends on the API having sanitised it. Markup that fails is no icon.
 */
export function iconId(icon: ContentTypeIcon | null | undefined): string | undefined {
  if (icon?.name && GLYPH_NAMES.has(icon.name)) return icon.name;
  if (icon?.svg) {
    const checked = checkSvg(icon.svg);
    if (checked.ok) return registerIcon(checked.symbol);
  }
  return undefined;
}

/**
 * A content type's icon, or the document glyph when it has none. Takes the fallback so a list
 * that used another glyph keeps it.
 */
export function TypeIcon({
  icon,
  fallback: Fallback = IconContent,
  ...props
}: { icon?: ContentTypeIcon | null; fallback?: GlyphComponent } & SVGProps<SVGSVGElement>) {
  const id = iconId(icon);
  if (!id) return <Fallback {...props} />;
  const glyph = TYPE_GLYPHS.find((g) => g.name === id);
  if (glyph) return glyph.render(props);
  return <CustomIcon id={id} {...props} />;
}
