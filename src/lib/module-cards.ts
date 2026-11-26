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

export interface ModuleCardStat {
  label: string;
  value: number;
  previous?: number;
  format: 'count' | 'percent';
  total?: number;
  goodWhen?: 'up' | 'down';
}

export interface ModuleCardPoint {
  /** A calendar day, `YYYY-MM-DD`. */
  date: string;
  value: number;
  previous?: number;
}

export interface ModuleCardSeries {
  label: string;
  points: ModuleCardPoint[];
  previousLabel?: string;
}

export interface ModuleCardBars {
  label: string;
  items: { label: string; value: number }[];
}

export interface ModuleCardCheck {
  label: string;
  tone: 'ok' | 'warn' | 'bad';
  value?: string;
}

export interface ModuleCardQuestion {
  /** A same-origin API path, held to the same rules as a card route. */
  route: string;
  placeholder: string;
  maxLength: number;
  maxTurns: number;
}

export interface ModuleCardContent {
  state: ModuleCardState;
  text: string;
  rows: ModuleCardRow[];
  note: string | null;
  updatedAt: Date | null;
  /** The optional parts below are absent, not empty, when nothing valid was sent. */
  stats?: ModuleCardStat[];
  series?: ModuleCardSeries;
  bars?: ModuleCardBars;
  checks?: ModuleCardCheck[];
  /** Label for the disclosure that holds the rows. Set only when a visual part is present. */
  rowsLabel?: string;
  question?: ModuleCardQuestion;
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
export const MAX_STATS = 4;
export const MAX_STAT_LABEL = 40;
export const MIN_POINTS = 2;
export const MAX_POINTS = 31;
export const MAX_BARS = 8;
export const MAX_BAR_LABEL = 60;
export const MAX_CHECKS = 6;
export const MAX_ROWS_LABEL = 40;
export const DEFAULT_ROWS_LABEL = 'Details';
export const MAX_PLACEHOLDER = 60;
export const MAX_QUESTION_LENGTH = 1000;
export const DEFAULT_QUESTION_LENGTH = 500;
export const MAX_QUESTION_TURNS = 20;
export const DEFAULT_QUESTION_TURNS = 10;

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

/** A finite number of 0 or more, else null. Strings and NaN are not numbers here. */
function cleanNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** An optional number: absent is fine, present and bad is a failure. */
function optionalNumber(value: unknown): { ok: boolean; value?: number } {
  if (value === undefined || value === null) return { ok: true };
  const n = cleanNumber(value);
  return n === null ? { ok: false } : { ok: true, value: n };
}

/** An optional label of 1 to `max` characters: absent is fine, present and bad is a failure. */
function optionalLabel(value: unknown, max: number): { ok: boolean; value?: string } {
  if (value === undefined || value === null) return { ok: true };
  const text = cleanText(value, max);
  return text ? { ok: true, value: text } : { ok: false };
}

function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const when = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(when.getTime()) && when.toISOString().slice(0, 10) === value;
}

function parseStats(value: unknown): ModuleCardStat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ModuleCardStat[] = [];
  for (const raw of value) {
    if (out.length >= MAX_STATS) break;
    if (!isRecord(raw)) continue;
    const label = cleanText(raw.label, MAX_STAT_LABEL);
    const amount = cleanNumber(raw.value);
    const previous = optionalNumber(raw.previous);
    const total = optionalNumber(raw.total);
    if (!label || amount === null || !previous.ok || !total.ok) continue;
    const format = raw.format === undefined || raw.format === null ? 'count' : raw.format;
    if (format !== 'count' && format !== 'percent') continue;
    const goodWhen = raw.goodWhen === undefined || raw.goodWhen === null ? undefined : raw.goodWhen;
    if (goodWhen !== undefined && goodWhen !== 'up' && goodWhen !== 'down') continue;
    const stat: ModuleCardStat = { label, value: amount, format };
    if (previous.value !== undefined) stat.previous = previous.value;
    if (total.value !== undefined) stat.total = total.value;
    if (goodWhen) stat.goodWhen = goodWhen;
    out.push(stat);
  }
  return out.length > 0 ? out : undefined;
}

function parseSeries(value: unknown): ModuleCardSeries | undefined {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length > MAX_POINTS) return undefined;
  const label = cleanText(value.label, MAX_BAR_LABEL);
  const previousLabel = optionalLabel(value.previousLabel, MAX_BAR_LABEL);
  if (!label || !previousLabel.ok) return undefined;
  const points: ModuleCardPoint[] = [];
  for (const raw of value.points) {
    if (!isRecord(raw) || !isCalendarDay(raw.date)) continue;
    const amount = cleanNumber(raw.value);
    const previous = optionalNumber(raw.previous);
    if (amount === null || !previous.ok) continue;
    points.push(previous.value === undefined ? { date: raw.date, value: amount } : { date: raw.date, value: amount, previous: previous.value });
  }
  if (points.length < MIN_POINTS) return undefined;
  return previousLabel.value ? { label, points, previousLabel: previousLabel.value } : { label, points };
}

function parseBars(value: unknown): ModuleCardBars | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  const label = cleanText(value.label, MAX_BAR_LABEL);
  if (!label) return undefined;
  const items: { label: string; value: number }[] = [];
  for (const raw of value.items) {
    if (items.length >= MAX_BARS) break;
    if (!isRecord(raw)) continue;
    const text = cleanText(raw.label, MAX_BAR_LABEL);
    const amount = cleanNumber(raw.value);
    if (!text || amount === null) continue;
    items.push({ label: text, value: amount });
  }
  return items.length > 0 ? { label, items } : undefined;
}

function parseChecks(value: unknown): ModuleCardCheck[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ModuleCardCheck[] = [];
  for (const raw of value) {
    if (out.length >= MAX_CHECKS) break;
    if (!isRecord(raw)) continue;
    const label = cleanText(raw.label, MAX_BAR_LABEL);
    const detail = optionalLabel(raw.value, MAX_VALUE);
    if (!label || !detail.ok) continue;
    if (raw.tone !== 'ok' && raw.tone !== 'warn' && raw.tone !== 'bad') continue;
    out.push(detail.value ? { label, tone: raw.tone, value: detail.value } : { label, tone: raw.tone });
  }
  return out.length > 0 ? out : undefined;
}

/** A whole number in `1..max`, the default when absent, null when present and out of range. */
function boundedInt(value: unknown, min: number, max: number, fallback: number): number | null {
  if (value === undefined || value === null) return fallback;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function parseQuestion(value: unknown): ModuleCardQuestion | undefined {
  if (!isRecord(value)) return undefined;
  const { route } = value;
  if (typeof route !== 'string' || route.length > MAX_ROUTE || !ROUTE_PATTERN.test(route) || AUTH_ROUTE.test(route)) return undefined;
  const placeholder = cleanText(value.placeholder, MAX_PLACEHOLDER);
  const maxLength = boundedInt(value.maxLength, 1, MAX_QUESTION_LENGTH, DEFAULT_QUESTION_LENGTH);
  const maxTurns = boundedInt(value.maxTurns, 0, MAX_QUESTION_TURNS, DEFAULT_QUESTION_TURNS);
  if (!placeholder || maxLength === null || maxTurns === null) return undefined;
  return { route, placeholder, maxLength, maxTurns };
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

  const content: ModuleCardContent = {
    state: state as ModuleCardState,
    text: cleanText(value.text, MAX_TEXT) ?? '',
    rows,
    note: cleanText(value.note, MAX_NOTE) || null,
    updatedAt,
  };

  // Parts are only read from an ok answer.
  if (state !== 'ok') return content;
  const stats = parseStats(value.stats);
  const series = parseSeries(value.series);
  const bars = parseBars(value.bars);
  const checks = parseChecks(value.checks);
  const question = parseQuestion(value.question);
  if (stats) content.stats = stats;
  if (series) content.series = series;
  if (bars) content.bars = bars;
  if (checks) content.checks = checks;
  if (stats || series || bars || checks) {
    // Cut one past the cap so a label that is too long is dropped, not shortened.
    const label = cleanText(value.rowsLabel, MAX_ROWS_LABEL + 1);
    content.rowsLabel = label && Array.from(label).length <= MAX_ROWS_LABEL ? label : DEFAULT_ROWS_LABEL;
  }
  if (question) content.question = question;
  return content;
}
