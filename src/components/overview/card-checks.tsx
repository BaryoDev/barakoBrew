import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ModuleCardCheck } from '@/lib/module-cards';
import { cn } from '@/lib/utils';

const TONES = {
  ok: { Icon: CheckCircle2, className: 'text-success', word: 'OK' },
  warn: { Icon: AlertTriangle, className: 'text-warning', word: 'Warning' },
  bad: { Icon: XCircle, className: 'text-destructive', word: 'Problem' },
} as const;

/** A short watch list. Each item has an icon and a word, so colour is never the only signal. */
export function CardChecks({ checks }: { checks: ModuleCardCheck[] }) {
  return (
    <ul data-testid="card-checks" className="grid content-start gap-1.5 text-sm">
      {checks.map((check, i) => {
        const { Icon, className, word } = TONES[check.tone];
        return (
          <li key={i} className="flex items-center gap-2">
            <Icon className={cn('size-4 shrink-0', className)} aria-hidden />
            <span className="sr-only">{word}: </span>
            <span className="min-w-0 truncate">{check.label}</span>
            {check.value && <span className="text-muted-foreground ml-auto shrink-0 text-xs">{check.value}</span>}
          </li>
        );
      })}
    </ul>
  );
}
