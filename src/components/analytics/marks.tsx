import type { MetricType } from '@/hooks/use-analytics';

export interface Mark {
  /** One or two letters shown in the monogram. */
  letter: string;
  /** The vendor's own colour. */
  color: string;
}

const NEUTRAL: Mark = { letter: '?', color: '#6b7280' };

const BROWSERS: Array<[RegExp, Mark]> = [
  [/edge/i, { letter: 'E', color: '#0078d4' }],
  [/(chrome|crios|chromium)/i, { letter: 'C', color: '#4285f4' }],
  [/(firefox|fxios)/i, { letter: 'F', color: '#ff7139' }],
  [/(safari|ios)/i, { letter: 'S', color: '#0fb5ee' }],
  [/opera/i, { letter: 'O', color: '#ff1b2d' }],
  [/samsung/i, { letter: 'S', color: '#1428a0' }],
  [/(brave)/i, { letter: 'B', color: '#fb542b' }],
];

const SYSTEMS: Array<[RegExp, Mark]> = [
  [/(windows)/i, { letter: 'W', color: '#0078d4' }],
  [/(android)/i, { letter: 'A', color: '#3ddc84' }],
  [/(ios|iphone|ipad|mac)/i, { letter: 'M', color: '#555555' }],
  [/(chrome ?os)/i, { letter: 'C', color: '#4285f4' }],
  [/(linux|ubuntu|debian|fedora)/i, { letter: 'L', color: '#e9a900' }],
];

function match(table: Array<[RegExp, Mark]>, name: string): Mark {
  return table.find(([re]) => re.test(name))?.[1] ?? NEUTRAL;
}

export function browserMark(name: string): Mark {
  return match(BROWSERS, name);
}

export function osMark(name: string): Mark {
  return match(SYSTEMS, name);
}

export type DeviceKind = 'desktop' | 'laptop' | 'mobile' | 'tablet' | 'unknown';

export function deviceKind(name: string): DeviceKind {
  const n = name.toLowerCase();
  if (n === 'desktop') return 'desktop';
  if (n === 'laptop') return 'laptop';
  if (n === 'mobile' || n === 'phone') return 'mobile';
  if (n === 'tablet') return 'tablet';
  return 'unknown';
}

/** The mark kind a metric card draws, or null when the card has no marks. */
export function markFor(type: MetricType, name: string): { kind: 'monogram'; mark: Mark } | { kind: 'device'; device: DeviceKind } | null {
  if (type === 'browser') return { kind: 'monogram', mark: browserMark(name) };
  if (type === 'os') return { kind: 'monogram', mark: osMark(name) };
  if (type === 'device') return { kind: 'device', device: deviceKind(name) };
  return null;
}

export function Monogram({ mark }: { mark: Mark }) {
  return (
    <span
      data-testid="monogram"
      data-letter={mark.letter}
      data-color={mark.color}
      aria-hidden
      className="inline-flex size-[18px] shrink-0 items-center justify-center rounded text-[10px] leading-none font-semibold text-white"
      style={{ backgroundColor: mark.color }}
    >
      {mark.letter}
    </span>
  );
}

const DEVICE_PATHS: Record<DeviceKind, React.ReactNode> = {
  desktop: (
    <>
      <rect x="2" y="3" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 16v5" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  tablet: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </>
  ),
};

export function DeviceGlyph({ device }: { device: DeviceKind }) {
  return (
    <svg
      data-testid="device-glyph"
      data-device={device}
      aria-hidden
      viewBox="0 0 24 24"
      className="text-muted-foreground size-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DEVICE_PATHS[device]}
    </svg>
  );
}

export function MetricMark({ type, name }: { type: MetricType; name: string }) {
  const m = markFor(type, name);
  if (!m) return null;
  return m.kind === 'monogram' ? <Monogram mark={m.mark} /> : <DeviceGlyph device={m.device} />;
}
