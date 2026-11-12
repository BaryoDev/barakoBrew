'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Mark = '→' | '✓' | '✗' | '·';
export interface DemoCase {
    label: string;
    /** Each line starts with a mark, a space, then the text. */
    lines: string[];
    result: { ok: boolean; text: string };
}
export interface DemoScript {
    ask: string;
    run: string;
    cases: DemoCase[];
}

/**
 * Canned scripts from the design canvas. Nothing here reads from the API: the card plays these
 * lines and nothing else, and says so on its face.
 */
export const DEMOS: Record<string, DemoScript> = {
    FeatureFlags: {
        ask: 'User',
        run: 'Evaluate',
        cases: [
            {
                label: 'Ana · kape-ana',
                lines: ['· flag  new-editor', '· rule  tenant kape-ana · 20% rollout', '· bucket 14 of 100', '✓ on'],
                result: { ok: true, text: 'new-editor is on for Ana' },
            },
            {
                label: 'Ben · kape-ana',
                lines: ['· flag  new-editor', '· rule  tenant kape-ana · 20% rollout', '· bucket 63 of 100', '✗ off · outside the 20%'],
                result: { ok: false, text: 'new-editor stays off' },
            },
        ],
    },
    Forms: {
        ask: 'Sender',
        run: 'Submit',
        cases: [
            {
                label: 'Real visitor',
                lines: [
                    '→ POST /api/forms/contact',
                    '· honeypot empty · 6.2 s to fill',
                    '✓ entry created in Contact submissions',
                    '· workflow  notify-owner queued',
                ],
                result: { ok: true, text: 'Submission arrived as an entry' },
            },
            {
                label: 'Spam bot',
                lines: ['→ POST /api/forms/contact', '· honeypot filled · 0.4 s to fill', '✗ 422 · spam check failed, nothing stored'],
                result: { ok: false, text: 'Refused before it became data' },
            },
        ],
    },
    Files: {
        ask: 'Upload',
        run: 'Upload',
        cases: [
            {
                label: 'receipt.jpg · 2.4 MB',
                lines: ['→ POST /api/files', '· stored in Postgres · tenant kape-ana', '✓ 201 · file id f_8k21'],
                result: { ok: true, text: 'Stored and ready to attach' },
            },
            {
                label: 'menu.exe',
                lines: ['→ POST /api/files', '✗ 415 · type not in Files:AllowedTypes'],
                result: { ok: false, text: 'Blocked by the allow-list' },
            },
        ],
    },
    Diagnostics: {
        ask: 'Report',
        run: 'Send',
        cases: [
            {
                label: 'Known error',
                lines: [
                    '→ POST /api/client-errors',
                    '· TypeError: price is undefined · /menu',
                    '· fingerprint 7c1e… · seen before',
                    '✓ occurrence count 14',
                ],
                result: { ok: false, text: 'Grouped with 13 earlier reports' },
            },
            {
                label: 'New error',
                lines: ['→ POST /api/client-errors', '· ReferenceError: map is not defined · /find-us', '✓ new fingerprint a92f…'],
                result: { ok: true, text: 'Logged for an Admin to fix' },
            },
        ],
    },
    Accounting: {
        ask: 'Case',
        run: 'Post',
        cases: [
            {
                label: 'Balanced entry',
                lines: ['· debit Cash 500.00 · credit Sales 500.00', '✓ journal entry JE-0043 posted'],
                result: { ok: true, text: 'Posted, the books balance' },
            },
            {
                label: 'Unbalanced journal',
                lines: ['· debit 500.00 · credit 450.00', '✗ 422 · entries must balance'],
                result: { ok: false, text: 'The write is refused' },
            },
        ],
    },
};

export function hasDemo(name: string): boolean {
    return name in DEMOS;
}

const LINE_MS = 420;
const MARK_CLASS: Record<string, string> = {
    '→': 'text-[#B3A7FF]',
    '✓': 'text-[#4FD1B8]',
    '✗': 'text-[#FF8A8A]',
    '·': 'text-[#8D91B0]',
};

function reducedMotion(): boolean {
    try {
        return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

export function TryItCard({ name }: { name: string }) {
    const script = DEMOS[name];
    const [caseIx, setCaseIx] = useState(0);
    const [shown, setShown] = useState(-1);
    const [busy, setBusy] = useState(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
    };
    useEffect(() => stop, []);

    if (!script) return null;
    const current = script.cases[caseIx] ?? script.cases[0];
    const done = shown >= current.lines.length && !busy;

    function run() {
        stop();
        if (reducedMotion()) {
            setShown(current.lines.length);
            setBusy(false);
            return;
        }
        setShown(0);
        setBusy(true);
        const total = current.lines.length;
        let n = 0;
        timer.current = setInterval(() => {
            n += 1;
            setShown(n);
            if (n >= total) {
                stop();
                setBusy(false);
            }
        }, LINE_MS);
    }

    function pick(i: number) {
        stop();
        setCaseIx(i);
        setShown(-1);
        setBusy(false);
    }

    return (
        <Card className="gap-3 p-[18px]" data-testid="try-it-card">
            <div className="flex items-center gap-2">
                <h2 className="font-display flex-1 text-[19px] font-semibold tracking-[-0.02em]">Try it</h2>
                <span
                    className="bg-secondary text-muted-foreground rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
                    data-testid="try-it-demo-label"
                >
                    Demo · sample data, not your tenant
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-[13px] font-semibold">{script.ask}</span>
                {script.cases.map((c, i) => (
                    <button
                        key={c.label}
                        type="button"
                        aria-pressed={i === caseIx}
                        onClick={() => pick(i)}
                        className={cn(
                            'min-h-8 rounded-full border px-3 text-[13px] font-semibold',
                            i === caseIx ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card',
                        )}
                    >
                        {c.label}
                    </button>
                ))}
                <Button type="button" size="sm" className="ml-auto" disabled={busy} onClick={run}>
                    {busy ? 'Running…' : done ? 'Run again' : script.run}
                </Button>
            </div>
            <div
                className="grid min-h-[140px] content-start gap-0.5 rounded-xl bg-[#14152B] px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-[#E6E8F5]"
                aria-live="polite"
                data-testid="try-it-console"
            >
                {shown < 0 && <span className="text-[#8D91B0]">Pick a case and press {script.run}.</span>}
                {shown >= 0 &&
                    current.lines.slice(0, shown).map((line) => {
                        const mark = line.slice(0, 1) as Mark;
                        return (
                            <div key={line} className="grid grid-cols-[16px_1fr] gap-2">
                                <span className={MARK_CLASS[mark] ?? 'text-[#8D91B0]'}>{mark}</span>
                                <span className="[overflow-wrap:anywhere]">{line.slice(2)}</span>
                            </div>
                        );
                    })}
            </div>
            {done && (
                <div
                    role="status"
                    data-testid="try-it-result"
                    className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold',
                        current.result.ok ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
                    )}
                >
                    <span aria-hidden>{current.result.ok ? '✓' : '✗'}</span>
                    {current.result.text}
                </div>
            )}
        </Card>
    );
}
