import type { ComponentType, SVGProps } from 'react';

/**
 * What a method panel can tell the sign-in page. A panel never navigates or stores a session on its
 * own: it reports where the sign-in got to and the page decides which step comes next.
 */
export interface SignInFlow {
    /** The password was right, the device is new, and the server mailed a code to this address. */
    needsDeviceCode(email: string, message?: string): void;
    /** A passwordless code was requested for this address. */
    codeRequested(email: string, message?: string): void;
    /** A second factor is owed. The challenge token completes it. */
    needsMfa(challengeToken: string): void;
    /** Tokens were issued. */
    signedIn(): void;
    /** Move to another tab, for example from "Forgot it?" to the emailed code. */
    openMethod(id: string): void;
    /** The ids that have a tab right now, so a panel only points at a route that exists. */
    availableMethods: readonly string[];
}

/**
 * What the form fields hold. Lives on the page, not in a panel, so what was typed survives the
 * methods list arriving and a switch from one tab to another.
 */
export interface SignInFormState {
    username: string;
    password: string;
    email: string;
    setUsername(value: string): void;
    setPassword(value: string): void;
    setEmail(value: string): void;
}

export interface SignInPanelProps {
    flow: SignInFlow;
    form: SignInFormState;
    /** Put focus in the first field on mount. Set when the panel was opened by a link, not a tab. */
    autoFocusField?: boolean;
}

/** One way in the console knows how to draw, keyed by the id the server lists. */
export interface SignInMethodEntry {
    id: string;
    label: string;
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
    Panel: ComponentType<SignInPanelProps>;
}
