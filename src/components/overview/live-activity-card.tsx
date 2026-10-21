/**
 * Who did what, as it happens. The API has no activity feed yet (barakoCMS#677), so this says so
 * instead of showing made-up lines. The audit log is the nearest real thing and is linked.
 */
import Link from 'next/link';

export function LiveActivityCard() {
  return (
    <section aria-labelledby="overview-activity" className="border-border bg-card rise grid gap-2.5 rounded-[18px] border p-5">
      <div className="flex items-center gap-2.5">
        <h2 id="overview-activity" className="font-display flex-1 text-xl font-semibold tracking-[-0.02em]">
          Live activity
        </h2>
      </div>
      <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
        Not available yet. The API has no activity feed to read (barakoCMS#677). Until it does, the{' '}
        <Link href="/audit" className="text-accent-foreground font-semibold hover:underline">
          audit log
        </Link>{' '}
        records who changed what.
      </p>
    </section>
  );
}
