/**
 * Module cards: small text-only cards an enabled module declares in its manifest and the Overview
 * draws with one generic component. No module code runs in the console. The server validates both
 * the declaration and the content, and the console does not trust either.
 */

export interface ModuleCardDeclaration {
  id: string;
  title: string;
  /** A same-origin API path, already checked against `ROUTE_PATTERN`. */
  route: string;
  /** Text for an optional refresh button. Only kept when it is 1 to 24 plain characters. */
  refreshLabel?: string;
}

export type ModuleCardState = 'ok' | 'empty' | 'unavailable';

export interface ModuleCardRow {
  label: string;
  value: string;
}

export interface ModuleCardContent {
  state: ModuleCardState;
  text: string;
  rows: ModuleCardRow[];
  note: string | null;
  updatedAt: Date | null;
}

export const ROUTE_PATTERN = /^\/api\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
/** Auth routes are never a card: a card must not be a way to reach the sign-in or token endpoints. */
const AUTH_ROUTE = /^\/api\/auth(\/|$)/;
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const MAX_ROUTE = 200;
export const MAX_CARDS_PER_MODULE = 4;
export const MAX_TITLE = 60;
export const MAX_REFRESH_LABEL = 24;
export const MAX_TEXT = 1000;
export const MAX_ROWS = 12;
export const MAX_LABEL = 60;
export const MAX_VALUE = 120;
export const MAX_NOTE = 200;

const STATES: readonly string[] = ['ok', 'empty', 'unavailable'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tabs and line breaks become spaces, every other control character is removed, then trimmed and cut. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/[\t\n\r]+/g, ' ').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, '')
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  return Array.from(flat.trim()).slice(0, max).join('');
}

/** A refresh label, trimmed, or undefined when it is not a string of 1 to 24 UTF-16 units (as core counts) without control, format or line and paragraph separator characters. */
function cleanRefreshLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.trim();
  if (!label || label.length > MAX_REFRESH_LABEL || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) return undefined;
  return label;
}

/** The cards a module declared, defensively. A missing or non-array value is no cards. */
export function parseModuleCards(value: unknown): ModuleCardDeclaration[] {
  if (!Array.isArray(value)) return [];
  const out: ModuleCardDeclaration[] = [];
  for (const raw of value) {
    if (out.length >= MAX_CARDS_PER_MODULE) break;
    if (!isRecord(raw)) continue;
    const { id, route } = raw;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) continue;
    if (typeof route !== 'string' || route.length > MAX_ROUTE || !ROUTE_PATTERN.test(route) || AUTH_ROUTE.test(route)) continue;
    const title = cleanText(raw.title, MAX_TITLE);
    if (!title) continue;
    if (out.some((card) => card.id === id)) continue;
    const refreshLabel = cleanRefreshLabel(raw.refreshLabel);
    out.push(refreshLabel ? { id, title, route, refreshLabel } : { id, title, route });
  }
  return out;
}

/** The content a card route returned, or null when it is not one the console will draw. */
export function parseModuleCardContent(value: unknown): ModuleCardContent | null {
  if (!isRecord(value)) return null;
  const state = value.state;
  if (typeof state !== 'string' || !STATES.includes(state)) return null;

  const rows: ModuleCardRow[] = [];
  if (Array.isArray(value.rows)) {
    for (const raw of value.rows) {
      if (rows.length >= MAX_ROWS) break;
      if (!isRecord(raw)) continue;
      const label = cleanText(raw.label, MAX_LABEL);
      const text = cleanText(raw.value, MAX_VALUE);
      if (!label || text === null) continue;
      rows.push({ label, value: text });
    }
  }

  let updatedAt: Date | null = null;
  if (typeof value.updatedAt === 'string') {
    const when = new Date(value.updatedAt);
    if (!Number.isNaN(when.getTime())) updatedAt = when;
  }

  return {
    state: state as ModuleCardState,
    text: cleanText(value.text, MAX_TEXT) ?? '',
    rows,
    note: cleanText(value.note, MAX_NOTE) || null,
    updatedAt,
  };
}
