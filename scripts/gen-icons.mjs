// Generates src/components/icons/index.tsx from line-awesome (Icons8) SVGs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_DIR = join(ROOT, 'node_modules/line-awesome/svg');
const OUT = join(ROOT, 'src/components/icons/index.tsx');

// semantic component name -> line-awesome file
const ICONS = {
  Dashboard: 'tachometer-alt-solid',
  ContentTypes: 'shapes-solid',
  Content: 'file-alt-solid',
  Workflows: 'project-diagram-solid',
  Users: 'users-solid',
  Roles: 'user-shield-solid',
  Groups: 'users-cog-solid',
  Health: 'heartbeat-solid',
  Settings: 'cog-solid',
  User: 'user-solid',
  UserPlus: 'user-plus-solid',
  SignOut: 'sign-out-alt-solid',
  SignIn: 'sign-in-alt-solid',
  Plus: 'plus-solid',
  Search: 'search-solid',
  Pen: 'pen-solid',
  Trash: 'trash-solid',
  Eye: 'eye-solid',
  EyeSlash: 'eye-slash',
  Check: 'check-solid',
  Times: 'times-solid',
  History: 'history-solid',
  Rollback: 'undo-alt-solid',
  Bolt: 'bolt-solid',
  Envelope: 'envelope-solid',
  Sms: 'sms-solid',
  Webhook: 'globe-solid',
  Tasks: 'tasks-solid',
  FieldEdit: 'edit-solid',
  Conditional: 'code-branch-solid',
  Play: 'play-solid',
  Bug: 'bug-solid',
  Shield: 'shield-alt-solid',
  Key: 'key-solid',
  Database: 'database-solid',
  Server: 'server-solid',
  Memory: 'memory-solid',
  Disk: 'hdd-solid',
  Sun: 'sun-solid',
  Moon: 'moon-solid',
  More: 'ellipsis-h-solid',
  ArrowRight: 'arrow-right-solid',
  ArrowLeft: 'arrow-left-solid',
  Copy: 'copy-solid',
  Filter: 'filter-solid',
  Calendar: 'calendar-solid',
  Clock: 'clock-solid',
  Info: 'info-circle-solid',
  Warning: 'exclamation-triangle-solid',
  CheckCircle: 'check-circle-solid',
  TimesCircle: 'times-circle-solid',
  Refresh: 'sync-alt-solid',
  Archive: 'archive-solid',
  Lock: 'lock-solid',
  Unlock: 'unlock-solid',
  Toggle: 'toggle-on-solid',
  Hashtag: 'hashtag-solid',
  Text: 'font-solid',
  List: 'list-solid',
  Cube: 'cube-solid',
  Table: 'table-solid',
  ChevronRight: 'chevron-right-solid',
  ChevronDown: 'chevron-down-solid',
  ChevronLeft: 'chevron-left-solid',
  ExternalLink: 'external-link-alt-solid',
  Send: 'paper-plane-solid',
  Coffee: 'coffee-solid',
  Mug: 'mug-hot-solid',
};

// Glyphs drawn for the product rather than taken from line-awesome, as the markup that sits inside
// the 32x32 <svg>. Analytics, Coins, Flag and Mobile were hand added to the output before this
// existed; they are here so a regeneration keeps them.
const CUSTOM = {
  Analytics: '<path d="M 4 3 L 4 27 C 4 27.554688 4.445313 28 5 28 L 29 28 L 29 26 L 6 26 L 6 3 Z M 24 8 L 24 24 L 27 24 L 27 8 Z M 18 12 L 18 24 L 21 24 L 21 12 Z M 12 16 L 12 24 L 15 24 L 15 16 Z"/>',
  Coins: '<path d="M 16 5 C 10.477 5 6 6.79 6 9 C 6 11.21 10.477 13 16 13 C 21.523 13 26 11.21 26 9 C 26 6.79 21.523 5 16 5 Z M 6 12 L 6 15 C 6 17.21 10.477 19 16 19 C 21.523 19 26 17.21 26 15 L 26 12 C 26 14.21 21.523 16 16 16 C 10.477 16 6 14.21 6 12 Z M 6 18 L 6 21 C 6 23.21 10.477 25 16 25 C 21.523 25 26 23.21 26 21 L 26 18 C 26 20.21 21.523 22 16 22 C 10.477 22 6 20.21 6 18 Z"/>',
  Flag: '<path d="M 7 3 C 6.448 3 6 3.448 6 4 L 6 29 L 8 29 L 8 18 L 24 18 C 24.828 18 25.316 17.07 24.832 16.4 L 21.236 11.5 L 24.832 6.6 C 25.316 5.93 24.828 5 24 5 L 8 5 L 8 4 C 8 3.448 7.552 3 7 3 Z"/>',
  Mobile: '<path d="M 10 2 C 8.355 2 7 3.355 7 5 L 7 27 C 7 28.645 8.355 30 10 30 L 22 30 C 23.645 30 25 28.645 25 27 L 25 5 C 25 3.355 23.645 2 22 2 Z M 10 4 L 22 4 C 22.565 4 23 4.435 23 5 L 23 27 C 23 27.565 22.565 28 22 28 L 10 28 C 9.435 28 9 27.565 9 27 L 9 5 C 9 4.435 9.435 4 10 4 Z M 14 25 L 18 25 L 18 27 L 14 27 Z"/>',
};

let out = `// Icon set: Line Awesome by Icons8 — https://icons8.com/line-awesome (MIT-style free license)
// Vendored as inline SVG React components (32x32 viewBox, currentColor fill).
// Regenerate with scripts/gen-icons.mjs if you need more glyphs.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 32 32',
    width: '1em',
    height: '1em',
    fill: 'currentColor',
    'aria-hidden': true as const,
    ...props,
  };
}

`;

for (const [name, file] of Object.entries(ICONS)) {
  const svg = readFileSync(join(SVG_DIR, `${file}.svg`), 'utf8');
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  out += `export function Icon${name}(props: IconProps) {\n  return <svg {...base(props)}>${inner}</svg>;\n}\n\n`;
}

for (const [name, inner] of Object.entries(CUSTOM)) {
  out += `export function Icon${name}(props: IconProps) {\n  return <svg {...base(props)}>${inner}</svg>;\n}\n\n`;
}

writeFileSync(OUT, out);
console.log(`wrote ${OUT} with ${Object.keys(ICONS).length + Object.keys(CUSTOM).length} icons`);
