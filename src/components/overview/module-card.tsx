'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { useModules } from '@/hooks/use-modules';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardBars } from './card-bars';
import { CardChecks } from './card-checks';
import { CardSeries } from './card-series';
import { CardStats } from './card-stats';
import {
  parseModuleCardContent,
  parseModuleCards,
  type ModuleCardDeclaration,
} from '@/lib/module-cards';

const STALE_MS = 5 * 60 * 1000;

function isClientError(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500;
}

/** Retry-After as whole seconds clamped to 1..3600, or null when the header is missing or not a number. */
function retryAfterSeconds(error: unknown): number | null {
  const headers = (axios.isAxiosError(error) ? error.response?.headers : undefined) as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined;
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Math.min(3600, Math.max(1, Math.round(Number(text))));
}

/**
 * One card a module declared. It reads the declared route through the console's API client, so the
 * session and base path apply as for any other query, and draws the answer as plain text. Any error
 * or content it does not recognise draws nothing.
 */
export function ModuleCard({ module, card }: { module: string; card: ModuleCardDeclaration }) {
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();
  const queryKey = ['module-card', tenant, module, card.id, card.route];
  const busy = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.get<unknown>(card.route, { skipAuthRefresh: true });
      return parseModuleCardContent(response.data);
    },
    staleTime: STALE_MS,
    retry: (count, error) => !isClientError(error) && count < 1,
  });

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const response = await api.post<unknown>(card.route, undefined, { skipAuthRefresh: true });
      const fresh = parseModuleCardContent(response.data);
      if (fresh) {
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, fresh);
        setRefreshNote(null);
      } else {
        setRefreshNote('Could not refresh.');
      }
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 429) {
        const seconds = retryAfterSeconds(error);
        setRefreshNote(seconds === null ? 'Try again shortly.' : `Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`);
      } else {
        setRefreshNote('Could not refresh.');
      }
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }

  const headingId = `module-card-${module}-${card.id}`.replace(/[^A-Za-z0-9_-]/g, '-');

  if (isLoading) {
    return (
      <section aria-busy="true" className="border-border bg-card grid gap-3 rounded-[18px] border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
      </section>
    );
  }
  if (!data) return null;

  const muted = data.state !== 'ok';
  const hasParts = data.state === 'ok' && Boolean(data.stats || data.series || data.bars || data.checks);
  const rows =
    data.state === 'ok' && data.rows.length > 0 ? (
      <dl className="grid gap-1 text-sm">
        {data.rows.map((row, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    ) : null;
  return (
    <section aria-labelledby={headingId} className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <h2 id={headingId} className="font-display text-xl font-semibold tracking-[-0.02em]">
        {card.title}
      </h2>
      {data.text && (
        <p className={muted ? 'text-muted-foreground text-sm' : 'text-secondary-foreground text-sm'}>{data.text}</p>
      )}
      {hasParts && data.stats && <CardStats stats={data.stats} />}
      {hasParts && data.series && <CardSeries series={data.series} />}
      {hasParts && (data.bars || data.checks) && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.bars && <CardBars bars={data.bars} />}
          {data.checks && <CardChecks checks={data.checks} />}
        </div>
      )}
      {rows && hasParts && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">{data.rowsLabel ?? 'Details'}</summary>
          <div className="mt-2">{rows}</div>
        </details>
      )}
      {rows && !hasParts && rows}
      {data.state === 'ok' && data.note && <p className="text-muted-foreground text-[13px]">{data.note}</p>}
      {data.state === 'ok' && data.updatedAt && (
        <p className="text-muted-foreground text-xs">
          Updated <time dateTime={data.updatedAt.toISOString()}>{formatDistanceToNow(data.updatedAt, { addSuffix: true })}</time>
        </p>
      )}
      {card.refreshLabel && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
            {card.refreshLabel}
          </Button>
          <p role="status" className="text-muted-foreground text-xs">
            {refreshNote}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The cards enabled modules declare, in module list order and then card order. Reads the modules
 * query the rest of the console shares. An older server sends no cards and nothing is drawn.
 */
export function ModuleCards() {
  const { data } = useModules();
  if (data?.kind !== 'modules') return null;
  const cards = data.modules
    .filter((m) => m.enabled)
    .flatMap((m) => parseModuleCards(m.cards).map((card) => ({ module: m.name, card })));
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map(({ module, card }) => (
        <ModuleCard key={`${module}/${card.id}`} module={module} card={card} />
      ))}
    </>
  );
}
