'use client';

import { useApiMeta } from '@/hooks/use-meta';
import { useHealthStatus } from '@/hooks/use-monitoring';
import { SUPPORTED_CONTRACT } from '@/lib/api-contract';
import { durationMs } from '@/lib/overview';
import { cn } from '@/lib/utils';

type Dot = 'ok' | 'warn' | 'bad' | 'none';

function dotFor(status?: string): Dot {
  if (status === 'Healthy') return 'ok';
  if (status === 'Degraded') return 'warn';
  if (!status) return 'none';
  return 'bad';
}

/** Health entries are named by the API; match the database and storage checks by name. */
function findEntry<T extends { status: string }>(entries: Record<string, T> | undefined, words: string[]) {
  if (!entries) return undefined;
  const key = Object.keys(entries).find((name) => words.some((w) => name.toLowerCase().includes(w)));
  return key ? entries[key] : undefined;
}

function Item({ label, dot, children }: { label: string; dot: Dot; children: React.ReactNode }) {
  return (
    <span className="text-secondary-foreground flex items-center gap-1.5 py-1 text-[12.5px]">
      <span
        aria-hidden
        className={cn(
          'size-[7px] rounded-full',
          dot === 'ok' && 'bg-success',
          dot === 'warn' && 'bg-warning',
          dot === 'bad' && 'bg-destructive',
          dot === 'none' && 'bg-(--faint)',
        )}
      />
      <b className="text-foreground font-semibold">{label}</b>
      {children}
    </span>
  );
}

/**
 * API version, contract, database latency and storage. Each part shows a dash or Unknown when its
 * own call failed or the API does not send it, so one failing read never blanks the strip.
 */
export function SystemStrip() {
  const meta = useApiMeta();
  const health = useHealthStatus();
  const database = findEntry(health.data?.entries, ['postgres', 'database', 'marten', 'db']);
  const storage = findEntry(health.data?.entries, ['storage', 'seaweed', 's3', 'file']);
  const contract = meta.data?.apiContractVersion;
  const latency = durationMs(database?.duration);

  return (
    <div
      aria-label="System status"
      role="group"
      className="bg-secondary flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-full px-3.5 py-1.5"
    >
      <Item label="API" dot={meta.data?.version ? 'ok' : 'none'}>
        <span className="font-mono text-xs">{meta.data?.version ?? '—'}</span>
      </Item>
      <Item label="Contract" dot={contract != null ? 'ok' : 'none'}>
        {contract != null ? (
          <span className="font-mono text-xs">
            {contract} · console speaks {SUPPORTED_CONTRACT.min} to {SUPPORTED_CONTRACT.max}
          </span>
        ) : (
          <span className="font-mono text-xs">{'—'}</span>
        )}
      </Item>
      <Item label="Database" dot={dotFor(database?.status)}>
        <span>{database?.status ?? 'Unknown'}</span>
        {latency != null && <span className="font-mono text-xs">· {latency} ms</span>}
      </Item>
      <Item label="Storage" dot={dotFor(storage?.status)}>
        <span>{storage?.status ?? 'Unknown'}</span>
      </Item>
    </div>
  );
}
