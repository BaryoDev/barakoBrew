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
}

export interface SignInPanelProps {
    flow: SignInFlow;
}

/** One way in the console knows how to draw, keyed by the id the server lists. */
export interface SignInMethodEntry {
    id: string;
    label: string;
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
    Panel: ComponentType<SignInPanelProps>;
}
