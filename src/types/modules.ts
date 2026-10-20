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
    /** NuGet package id. Not sent by every API; the card shows what it is given. */
    package?: string;
    version?: string;
    category?: string;
    description?: string;
    /**
     * False for a module the API knows of and the deployment does not carry. An API that omits it
     * is saying nothing, which is read as installed, because `/api/modules` lists only what it saw.
     */
    installed?: boolean;
}

/** What the module screen's Configuration card reads, from `GET /api/modules/{name}/configuration`. */
export interface ModuleConfigurationEntry {
    key: string;
    /** Null when `redacted`, and null when the key is unset. */
    value: string | null;
    redacted: boolean;
    scope: 'deployment' | 'tenant' | string;
    source: 'appsettings' | 'environment' | 'default' | 'unknown' | string;
}

export interface ModuleConfiguration {
    module: string;
    section: string;
    entries: ModuleConfigurationEntry[];
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
    forms: 'Forms',
    import: 'Import',
    pages: 'Pages',
    portability: 'Portability',
    pwa: 'Pwa',
} as const;
