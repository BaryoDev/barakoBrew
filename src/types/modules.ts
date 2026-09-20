/**
 * What `GET /api/modules` says about one module: the name it registered under, the module contract
 * version it declared, whether the enabled list let it run, and what the schema preflight found.
 *
 * A module that is not installed at all is not in the list, so absence and `enabled: false` mean
 * different things to the API and the same thing to the console: the deployment does not serve it.
 */
export interface ModuleSummary {
    name: string;
    contractVersion: number;
    enabled: boolean;
    /** `ready`, `needs-migration`, or `unknown` when the preflight did not run for it. */
    schemaState: string;
    schemaChanges: string[];
}

/**
 * The module names the console asks about, as the modules themselves register them. Copied from the
 * API the same way `NavItem.roles` is: it can drift, and a mismatch shows up as a rail item that
 * never appears, so each one is the name in the module's own `Name` property and nothing else.
 */
export const MODULE = {
    accounting: 'Accounting',
    analytics: 'Analytics.Umami',
    deviceTrust: 'DeviceTrust',
    emailEvents: 'Email.Resend',
    featureFlags: 'FeatureFlags',
    files: 'Files',
    import: 'Import',
    pages: 'Pages',
    portability: 'Portability',
    pwa: 'Pwa',
} as const;
