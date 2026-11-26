'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import axios from 'axios';
import { api } from '@/lib/api';
import { cleanText, type ModuleCardQuestion } from '@/lib/module-cards';
import { retryAfterSeconds } from '@/lib/retry-after';
import { Button } from '@/components/ui/button';

export const MAX_ANSWER = 2000;
const MAX_BODY_BYTES = 7168;
const COUNTER_FROM = 0.8;

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

interface Entry {
  question: string;
  answer: string;
  refused: boolean;
  from: string | null;
}

interface State {
  tenant: string;
  entries: Entry[];
  input: string;
  error: string | null;
  pending: boolean;
}

const fresh = (tenant: string): State => ({ tenant, entries: [], input: '', error: null, pending: false });

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * The turns to send back: the newest `maxTurns`, then fewer while the whole body is over `maxBytes`.
 * The oldest go first, and the list never starts with a reply that has lost its question.
 */
export function trimTurns(
  turns: Turn[],
  maxTurns: number,
  maxBytes = MAX_BODY_BYTES,
  rest: { question: string; timeZone: string } = { question: '', timeZone: '' },
): Turn[] {
  let kept = maxTurns > 0 ? turns.slice(-maxTurns) : [];
  while (kept.length > 0 && (kept[0].role !== 'user' || byteLength({ ...rest, turns: kept }) > maxBytes)) {
    kept = kept.slice(1);
  }
  return kept;
}

/** An answer as plain paragraphs: control, bidi and format characters removed, line breaks kept, cut to 2000. */
export function answerParagraphs(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const flat = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/g, '')
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  return Array.from(flat.trim())
    .slice(0, MAX_ANSWER)
    .join('')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shortDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const when = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function sourceLine(data: Record<string, unknown>): string | null {
  const names = (Array.isArray(data.sourceLabels) && data.sourceLabels.length > 0 ? data.sourceLabels : data.sources) as unknown;
  const list = Array.isArray(names)
    ? names.map((name) => cleanText(name, 40)).filter((name): name is string => Boolean(name)).slice(0, 10)
    : [];
  const window = data.window as Record<string, unknown> | null | undefined;
  const from = window && typeof window === 'object' ? shortDay(window.from) : null;
  const to = window && typeof window === 'object' ? shortDay(window.to) : null;
  const range = from && to ? (from === to ? from : `${from} to ${to}`) : null;
  if (list.length === 0 && !range) return null;
  return [list.length > 0 ? `From: ${list.join(', ')}` : null, range].filter(Boolean).join('. ');
}

function failure(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 429) {
    const seconds = retryAfterSeconds(error);
    return seconds === null ? 'Try again shortly.' : `Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
  }
  if (status === 400 || status === 413) return 'That was too long. Clear the conversation and try again.';
  return 'Questions are not available right now.';
}

/**
 * A question box a card names. It keeps the conversation in React state for the current tenant,
 * sends one question at a time to the route the card named, and draws every answer as plain text.
 */
export function CardQuestion({ question, tenantId }: { question: ModuleCardQuestion; tenantId: string }) {
  const [state, setState] = useState<State>(() => fresh(tenantId));
  const tenantRef = useRef(tenantId);
  const active = useRef<{ id: number; tenant: string } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    tenantRef.current = tenantId;
  }, [tenantId]);

  // A tenant switch starts an empty conversation.
  let current = state;
  if (state.tenant !== tenantId) {
    current = fresh(tenantId);
    setState(current);
  }
  const { entries, input, error, pending } = current;
  const patch = (change: Partial<State>) => setState((prev) => (prev.tenant === tenantId ? { ...prev, ...change } : prev));

  async function send() {
    const text = input.trim();
    if (!text || active.current?.tenant === tenantId) return;
    const sentFor = tenantId;
    const id = ++counter.current;
    active.current = { id, tenant: sentFor };
    const stale = () => active.current?.id !== id || tenantRef.current !== sentFor;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const earlier: Turn[] = entries
      .filter((entry) => !entry.refused)
      .flatMap((entry): Turn[] => [
        { role: 'user', text: entry.question },
        { role: 'assistant', text: entry.answer },
      ]);
    const turns = trimTurns(earlier, question.maxTurns, MAX_BODY_BYTES, { question: text, timeZone });
    patch({ pending: true, error: null });
    try {
      const response = await api.post<unknown>(question.route, { question: text, turns, timeZone }, { skipAuthRefresh: true });
      if (stale()) return;
      const data = (response.data ?? {}) as Record<string, unknown>;
      const answer = answerParagraphs(data.answer).join('\n');
      if (!answer) {
        patch({ pending: false, error: 'Questions are not available right now.' });
        return;
      }
      const entry: Entry = { question: text, answer, refused: data.refused === true, from: sourceLine(data) };
      setState((prev) => (prev.tenant === sentFor ? { ...prev, entries: [...prev.entries, entry], input: '', pending: false } : prev));
    } catch (caught) {
      if (stale()) return;
      patch({ pending: false, error: failure(caught) });
    } finally {
      if (active.current?.id === id) active.current = null;
    }
  }

  function clear() {
    active.current = null;
    patch({ entries: [], error: null, pending: false });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  const nearLimit = input.length >= question.maxLength * COUNTER_FROM;

  return (
    <div data-testid="card-question" className="border-border grid gap-3 border-t pt-4">
      <div aria-live="polite" className="grid gap-4">
        {entries.map((entry, i) => (
          <div key={i} className="grid gap-1 text-sm">
            <p className="text-muted-foreground text-xs font-medium">You</p>
            <p className="whitespace-pre-wrap">{entry.question}</p>
            <div className={entry.refused ? 'text-muted-foreground mt-1 grid gap-2' : 'text-secondary-foreground mt-1 grid gap-2'}>
              {entry.answer.split('\n').map((paragraph, j) => (
                <p key={j}>{paragraph}</p>
              ))}
            </div>
            {entry.from && <p className="text-muted-foreground text-xs">{entry.from}</p>}
          </div>
        ))}
        {pending && <p className="text-muted-foreground text-sm">Working on it</p>}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="grid gap-2">
        <textarea
          aria-label={question.placeholder}
          rows={2}
          value={input}
          maxLength={question.maxLength}
          placeholder={question.placeholder}
          onChange={(event) => patch({ input: event.target.value.slice(0, question.maxLength) })}
          onKeyDown={onKeyDown}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || input.trim() === ''}>
            Send
          </Button>
          {entries.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          )}
          {nearLimit && (
            <p className="text-muted-foreground ml-auto text-xs" data-testid="card-question-count">
              {input.length} / {question.maxLength}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
