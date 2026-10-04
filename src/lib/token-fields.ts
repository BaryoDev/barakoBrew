import { resolveFieldType, type FieldDefinition } from '@/types/schema';

/**
 * The entry data without its token fields.
 *
 * The server generates a token and discards any value sent for one, so a save never sends it: the
 * value read back is left out, and a token cannot travel further than the screen that showed it.
 * Keys are matched without regard to case, as the API finds a field in an entry.
 */
export function withoutTokenFields(
    fields: readonly FieldDefinition[],
    data: Record<string, unknown>,
): Record<string, unknown> {
    const tokens = new Set(
        fields.filter((f) => resolveFieldType(f.type) === 'token').map((f) => f.name.toLowerCase()),
    );
    if (tokens.size === 0) return data;
    return Object.fromEntries(Object.entries(data).filter(([key]) => !tokens.has(key.toLowerCase())));
}
