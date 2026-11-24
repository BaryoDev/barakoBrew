'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { useModules } from '@/hooks/use-modules';
import { Skeleton } from '@/components/ui/skeleton';
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

/**
 * One card a module declared. It reads the declared route through the console's API client, so the
 * session and base path apply as for any other query, and draws the answer as plain text. Any error
 * or content it does not recognise draws nothing.
 */
export function ModuleCard({ module, card }: { module: string; card: ModuleCardDeclaration }) {
  const tenant = useCurrentTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['module-card', tenant, module, card.id, card.route],
    queryFn: async () => {
      const response = await api.get<unknown>(card.route, { skipAuthRefresh: true });
      return parseModuleCardContent(response.data);
    },
    staleTime: STALE_MS,
    retry: (count, error) => !isClientError(error) && count < 1,
  });

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
  return (
    <section aria-labelledby={headingId} className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <h2 id={headingId} className="font-display text-xl font-semibold tracking-[-0.02em]">
        {card.title}
      </h2>
      {data.text && (
        <p className={muted ? 'text-muted-foreground text-sm' : 'text-secondary-foreground text-sm'}>{data.text}</p>
      )}
      {data.state === 'ok' && data.rows.length > 0 && (
        <dl className="grid gap-1 text-sm">
          {data.rows.map((row, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.state === 'ok' && data.note && <p className="text-muted-foreground text-[13px]">{data.note}</p>}
      {data.state === 'ok' && data.updatedAt && (
        <p className="text-muted-foreground text-xs">
          Updated <time dateTime={data.updatedAt.toISOString()}>{formatDistanceToNow(data.updatedAt, { addSuffix: true })}</time>
        </p>
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
