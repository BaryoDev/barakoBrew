import axios from 'axios';

/** Retry-After as whole seconds clamped to 1..3600, or null when the header is missing or not a number. */
export function retryAfterSeconds(error: unknown): number | null {
  const headers = (axios.isAxiosError(error) ? error.response?.headers : undefined) as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined;
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Math.min(3600, Math.max(1, Math.round(Number(text))));
}
