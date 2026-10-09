/**
 * The words that make a name read as a credential, as barakoCMS 4.6 checks them
 * (`CredentialNames.cs`). Only the fallback: from 4.7 `GET /api/meta/describe` publishes the list
 * the API checks with as `credentialNameParts`, and the console reads that (#215). "auth" alone is
 * not one, since it matches "author".
 */
export const FALLBACK_CREDENTIAL_NAME_PARTS: readonly string[] = [
    'secret', 'password', 'passwd', 'pwd', 'token', 'apikey', 'api_key',
    'credential', 'privatekey', 'private_key', 'accesskey', 'access_key',
    'authorization', 'bearer',
];

/** The API's list when it sent one that is a list of words, else the fallback. */
export function credentialNameParts(describe: unknown): readonly string[] {
    const parts = (describe as { credentialNameParts?: unknown } | null | undefined)?.credentialNameParts;
    if (!Array.isArray(parts) || parts.length === 0) return FALLBACK_CREDENTIAL_NAME_PARTS;
    const words = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return words.length === parts.length ? words : FALLBACK_CREDENTIAL_NAME_PARTS;
}

/** Whether a name holds one of `parts`, ignoring case, the way `CredentialNames.IsCredential` matches. */
export function readsAsCredential(name: string, parts: readonly string[] = FALLBACK_CREDENTIAL_NAME_PARTS): boolean {
    const lower = name.toLowerCase();
    return parts.some((part) => lower.includes(part.toLowerCase()));
}
