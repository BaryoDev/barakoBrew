/**
 * What this browser remembers about the instance it last signed in to, like a remembered login.
 *
 * The sign-in card may show the tenant name, core version and module count only on a browser that
 * has signed in to that instance before. Nothing here is a secret: a display name, a version, a
 * count and the time they were seen. Never a token, an email, or anything from a failed attempt,
 * so the only writer is code that runs once a session exists (BaryoDev/barakoBrew#268).
 *
 * One record, keyed to one API origin (scheme, host and port). Another origin finds none and clears
 * it, so http and https, or two ports on one machine, never share facts.
 */
export interface RememberedInstance {
    /** The API origin the facts were seen on, for example https://api.cafe.example. */
    origin: string;
    /** The tenant's display name, when the API gave one. */
    name: string | null;
    /** The core version, as `GET /api/meta` reports it. */
    version: string | null;
    /** How many modules are enabled. */
    modules: number | null;
    /** ISO time these facts were last seen. */
    seenAt: string;
}

export type InstanceFacts = Pick<RememberedInstance, 'name' | 'version' | 'modules'>;

/** Longest name and version kept. Anything longer is not a record of ours. */
export const MAX_NAME = 80;
export const MAX_VERSION = 32;

export const REMEMBERED_KEY = 'barako-brew:instance';
const CHANGE_EVENT = 'barako-brew:instance-change';

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** The raw stored text. A string is a stable snapshot for useSyncExternalStore. */
export function readRememberedRaw(): string | null {
    try {
        return storage()?.getItem(REMEMBERED_KEY) ?? null;
    } catch {
        return null;
    }
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** The record for `origin`, or null for no record, another origin's record, or one that is not ours. */
export function parseRemembered(raw: string | null, origin: string | null): RememberedInstance | null {
    if (!raw || !origin) return null;
    try {
        const v = JSON.parse(raw) as Record<string, unknown> | null;
        if (!v || v.origin !== origin || typeof v.seenAt !== 'string' || Number.isNaN(Date.parse(v.seenAt))) return null;
        const modules = typeof v.modules === 'number' && Number.isFinite(v.modules) && v.modules >= 0 ? v.modules : null;
        const name = text(v.name);
        const version = text(v.version);
        if ((name !== null && name.length > MAX_NAME) || (version !== null && version.length > MAX_VERSION)) return null;
        if (name === null && version === null && modules === null) return null;
        return { origin, name, version, modules, seenAt: v.seenAt };
    } catch {
        return null;
    }
}

/** True when a record is stored for some other origin. */
export function isForeign(raw: string | null, origin: string | null): boolean {
    if (!raw || !origin) return false;
    try {
        const v = JSON.parse(raw) as { origin?: unknown } | null;
        return v?.origin !== origin;
    } catch {
        return true;
    }
}

function notify() {
    try {
        window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
        // No window, nothing to tell.
    }
}

export function subscribeRemembered(callback: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

/**
 * Stores the facts for `origin`. Call it only once a session exists. A fact that is null keeps the
 * value already stored for the same origin rather than erasing it. Writes nothing when there is
 * nothing to say, and never throws: private windows and blocked storage are ordinary.
 */
export function rememberInstance(origin: string, facts: InstanceFacts, now: Date = new Date()): void {
    if (!origin) return;
    const before = parseRemembered(readRememberedRaw(), origin);
    const record: RememberedInstance = {
        origin,
        name: facts.name ?? before?.name ?? null,
        version: facts.version ?? before?.version ?? null,
        modules: facts.modules ?? before?.modules ?? null,
        seenAt: now.toISOString(),
    };
    if (record.name === null && record.version === null && record.modules === null) return;
    try {
        storage()?.setItem(REMEMBERED_KEY, JSON.stringify(record));
    } catch {
        return;
    }
    notify();
}

/** "Forget this browser", and the clean-up when the host changed. */
export function forgetInstance(): void {
    try {
        storage()?.removeItem(REMEMBERED_KEY);
    } catch {
        return;
    }
    notify();
}
