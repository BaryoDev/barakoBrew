'use client';

import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { useApiMeta } from '@/hooks/use-meta';
import { useHealthStatus } from '@/hooks/use-monitoring';

function toneFor(status?: string): Tone {
  if (status === 'Healthy') return 'success';
  if (status === 'Degraded') return 'warning';
  if (!status) return 'muted';
  return 'destructive';
}

/** Health entries are named by the API; match the database and storage checks by name. */
function findEntry(entries: Record<string, { status: string }> | undefined, words: string[]) {
  if (!entries) return undefined;
  const key = Object.keys(entries).find((name) => words.some((w) => name.toLowerCase().includes(w)));
  return key ? entries[key] : undefined;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * API version, contract version, database and storage health. Each part shows a dash when its own
 * call failed or the API does not send it, so one failing read never blanks the strip.
 */
export function SystemStrip() {
  const meta = useApiMeta();
  const health = useHealthStatus();
  const database = findEntry(health.data?.entries, ['postgres', 'database', 'marten', 'db']);
  const storage = findEntry(health.data?.entries, ['storage', 'seaweed', 's3', 'file']);
  const contract = meta.data?.apiContractVersion;

  return (
    <Card aria-label="System status" className="mb-4 py-3">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Item label="API">
          <span className="font-mono text-xs">{meta.data?.version ?? '—'}</span>
        </Item>
        <Item label="Contract">
          <span className="font-mono text-xs">{contract != null ? contract : '—'}</span>
        </Item>
        <Item label="Database">
          <StatusBadge tone={toneFor(database?.status)}>{database?.status ?? 'Unknown'}</StatusBadge>
        </Item>
        <Item label="Storage">
          <StatusBadge tone={toneFor(storage?.status)}>{storage?.status ?? 'Unknown'}</StatusBadge>
        </Item>
      </CardContent>
    </Card>
  );
}
