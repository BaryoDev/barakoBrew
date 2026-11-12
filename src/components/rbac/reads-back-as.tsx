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
  return (
    <aside aria-labelledby="reads-back-as" className="border-border bg-card grid content-start gap-2.5 rounded-2xl border p-5 lg:sticky lg:top-6">
      <div className="flex items-center gap-2">
        <h2 id="reads-back-as" className="font-display flex-1 text-[17px] font-semibold tracking-[-0.02em]">
          Reads back as
        </h2>
        <span className="text-muted-foreground text-xs">
          {sentences.length} {sentences.length === 1 ? 'rule' : 'rules'}
        </span>
      </div>
      {sentences.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing is granted yet.</p>
      ) : (
        <ul className="grid gap-2" aria-live="polite">
          {sentences.map((s, i) => (
            <li key={`${i}-${s.text}`} className="flex items-start gap-2.5 text-sm leading-normal">
              <span aria-hidden className={cn('mt-2 size-1.5 flex-none rounded-full', DOT[s.tone])} />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
