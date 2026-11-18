import { IconEnvelope, IconKey } from '@/components/icons';
import { EmailCodePanel } from './email-code-panel';
import { PasswordPanel } from './password-panel';
import { devQrMethod } from './dev-qr-method';
import type { SignInMethodEntry } from './types';

/**
 * Method tab components, keyed by the id `GET /api/auth/methods` lists.
 *
 * Adding a way in is one entry here (or a call to {@link registerSignInMethod} from the module that
 * owns it) and no change to the login page. The page draws a tab for an id only when the server
 * lists it and an entry exists, so an entry for a method an instance does not run costs nothing.
 */
export const SIGN_IN_METHODS: Record<string, SignInMethodEntry> = {
    password: { id: 'password', label: 'Password', icon: IconKey, Panel: PasswordPanel },
    'email-code': { id: 'email-code', label: 'Email code', icon: IconEnvelope, Panel: EmailCodePanel },
};

/** A function, or a forwardRef, memo or lazy component: an object tagged with a `$$typeof` symbol. */
function isComponent(value: unknown): boolean {
    if (typeof value === 'function') return true;
    return !!value && typeof value === 'object' && typeof (value as { $$typeof?: unknown }).$$typeof === 'symbol';
}

/**
 * Entries are components registered from code. Anything else (a string, a URL, a record without a
 * component) is refused, so the registry cannot be pointed at code fetched from somewhere.
 */
export function registerSignInMethod(entry: SignInMethodEntry): void {
    const ok =
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        entry.id !== '' &&
        entry.id === entry.id.trim().toLowerCase() &&
        entry.id !== '__proto__' &&
        typeof entry.label === 'string' &&
        isComponent(entry.icon) &&
        isComponent(entry.Panel);
    if (!ok) throw new TypeError('A sign-in method is registered as { id, label, icon, Panel } with a component for Panel.');
    SIGN_IN_METHODS[entry.id] = entry;
}

// A fixture for the browser tests, so they can draw a registered tab. Development server only: the
// check is replaced at build time, so a production build registers nothing.
if (process.env.NODE_ENV === 'development') registerSignInMethod(devQrMethod);
