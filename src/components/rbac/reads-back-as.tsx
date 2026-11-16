import type { RoleSentence } from '@/lib/role-sentences';
import { cn } from '@/lib/utils';

const DOT: Record<RoleSentence['tone'], string> = {
  accent: 'bg-primary',
  ok: 'bg-success',
  warn: 'bg-warning',
  muted: 'bg-muted-foreground',
};

/** The 340px rail beside the role editor: every rule in the role as a sentence, as it stands now. */
export function ReadsBackAs({ sentences }: { sentences: RoleSentence[] }) {
  // The same sentence twice (two rules that read alike) still needs distinct keys.
  const seen = new Map<string, number>();
  const keyed = sentences.map((s) => {
    const n = (seen.get(s.text) ?? 0) + 1;
    seen.set(s.text, n);
    return { ...s, key: `${s.text}#${n}` };
  });
  return (
    <aside
      aria-labelledby="reads-back-as"
      className="border-border bg-card grid min-w-0 content-start gap-2.5 rounded-2xl border p-5 lg:sticky lg:top-6"
    >
      <div className="flex items-center gap-2">
        <h2 id="reads-back-as" className="font-display flex-1 text-[17px] font-semibold tracking-[-0.02em]">
          Reads back as
        </h2>
        <span className="text-muted-foreground text-xs">
          {sentences.length} {sentences.length === 1 ? 'line' : 'lines'}
        </span>
      </div>
      {/* Always mounted, so a change to or from the empty state is announced too. */}
      <div aria-live="polite" aria-atomic="false" className="min-w-0">
        {keyed.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing is granted yet.</p>
        ) : (
          <ul className="grid gap-2">
            {keyed.map((s) => (
              <li key={s.key} className="flex min-w-0 items-start gap-2.5 text-sm leading-normal break-words">
                <span aria-hidden className={cn('mt-2 size-1.5 flex-none rounded-full', DOT[s.tone])} />
                <span className="min-w-0 break-words">{s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
