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
