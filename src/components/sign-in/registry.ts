import { IconEnvelope, IconKey } from '@/components/icons';
import { EmailCodePanel } from './email-code-panel';
import { PasswordPanel } from './password-panel';
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

export function registerSignInMethod(entry: SignInMethodEntry): void {
    SIGN_IN_METHODS[entry.id] = entry;
}
