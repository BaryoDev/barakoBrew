/** The pieces of a pairing link. `expiresAt` is ISO 8601, the link carries unix seconds. */
export interface PairingLinkInput {
    /** The address the phone calls: scheme, host, port, path base. A trailing slash is dropped. */
    url: string;
    tenant: string;
    name: string;
    code: string;
    expiresAt: string;
}

/** The unix seconds of an ISO time, rounded down. NaN when it does not parse. */
export function unixSeconds(iso: string): number {
    return Math.floor(Date.parse(iso) / 1000);
}

/**
 * The link the QR holds. Every value is percent-encoded, so a name with `&` or a space cannot
 * split into a second parameter. Returns null when the expiry does not parse.
 */
export function buildPairingLink(input: PairingLinkInput): string | null {
    const exp = unixSeconds(input.expiresAt);
    if (!Number.isFinite(exp)) return null;
    const parts: [string, string][] = [
        ['v', '2'],
        ['url', input.url.replace(/\/+$/, '')],
        ['tenant', input.tenant],
        ['name', input.name],
        ['code', input.code],
        ['exp', String(exp)],
    ];
    return `togo://connect?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** "4:07" for the seconds left. Never negative. */
export function countdownLabel(msLeft: number): string {
    const total = Math.max(0, Math.ceil(msLeft / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Whether a phone may be sent to this address: https, or http only for the local hosts a
 * simulator or emulator reaches (localhost, 127.0.0.1, 10.0.2.2).
 */
export function isSecureForPhone(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname);
}
