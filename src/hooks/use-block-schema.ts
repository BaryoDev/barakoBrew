'use client';

import { useQuery } from '@tanstack/react-query';
import { parseBlockSchema, type BlockSchema } from '@/lib/blocks';

/**
 * Where the site that renders this deployment's pages is, or null when the console was not told.
 *
 * Read the way the API address is: from `env-config.js`, which the container writes at start, then
 * from the build. One address per console, because a deployment runs one barakoPress image and every
 * tenant on it renders from the same block registry.
 */
export function getPressUrl(): string | null {
    const runtime =
        typeof window !== 'undefined'
            ? (window._env_ as Record<string, string | undefined> | undefined)?.NEXT_PUBLIC_PRESS_URL
            : undefined;
    const url = (runtime || process.env.NEXT_PUBLIC_PRESS_URL || '').trim();
    return url ? url.replace(/\/+$/, '') : null;
}

export type BlockSchemaState =
    | { status: 'unconfigured' }
    | { status: 'loading'; url: string }
    | { status: 'unavailable'; url: string }
    | { status: 'ready'; url: string; schema: BlockSchema };

/**
 * The block schema the site publishes at `/api/blocks`.
 *
 * A plain fetch and not the API client: the document is public, lives on another origin, and must
 * never be sent the session's bearer token.
 */
export function useBlockSchema(): BlockSchemaState {
    const base = getPressUrl();
    const url = base ? `${base}/api/blocks` : null;
    const query = useQuery({
        queryKey: ['block-schema', url],
        enabled: url !== null,
        queryFn: async () => {
            const response = await fetch(url!, { credentials: 'omit', headers: { accept: 'application/json' } });
            if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
            const schema = parseBlockSchema(await response.json());
            if (!schema) throw new Error(`${url} is not a block schema this console reads`);
            return schema;
        },
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    if (url === null) return { status: 'unconfigured' };
    if (query.data) return { status: 'ready', url, schema: query.data };
    if (query.isError) return { status: 'unavailable', url };
    return { status: 'loading', url };
}
