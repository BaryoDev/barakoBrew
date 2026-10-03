/**
 * The capabilities a role can be granted, with the words the role editor shows for them.
 *
 * Mirrors `SystemCapabilities` in barakoCMS core, plus the module names a console screen depends on.
 * A name missing here can still be granted as a free-form tag; this list only decides which ones get
 * a labelled checkbox. The API saves an unknown name and reports it back, so a stale list here
 * costs a label, not a grant.
 */
export interface CapabilityInfo {
    name: string;
    label: string;
    hint?: string;
}

export const KNOWN_CAPABILITIES: readonly CapabilityInfo[] = [
    { name: 'manage_roles', label: 'Manage roles' },
    { name: 'manage_tenants', label: 'Manage tenants' },
    { name: 'manage_tenant_members', label: 'Manage tenant members' },
    { name: 'manage_users', label: 'Manage user accounts' },
    { name: 'manage_user_membership', label: 'Give users roles' },
    { name: 'manage_user_groups', label: 'Manage user groups' },
    { name: 'manage_api_keys', label: 'Manage API keys' },
    { name: 'view_audit_log', label: 'Read the audit log' },
    { name: 'manage_settings', label: 'Manage settings' },
    { name: 'manage_email_settings', label: 'Manage email settings' },
    { name: 'manage_content_types', label: 'Manage content types' },
    { name: 'manage_public_delivery', label: 'Turn public delivery on or off' },
    { name: 'view_modules', label: 'See installed modules' },
    { name: 'view_monitoring', label: 'See monitoring' },
    { name: 'manage_redirects', label: 'Manage redirects' },
    { name: 'manage_queries', label: 'Manage saved queries' },
    { name: 'manage_requests', label: 'Manage outbound requests' },
    { name: 'view_connectors', label: 'See connectors' },
    { name: 'manage_connectors', label: 'Manage connectors' },
    { name: 'manage_workflows', label: 'Manage workflows' },
    { name: 'view_workflow_runs', label: 'See workflow runs' },
    { name: 'view_webhook_response_bodies', label: 'See webhook response bodies' },
    { name: 'retry_workflow_actions', label: 'Retry workflow actions' },
    { name: 'rollback_content', label: 'Roll back entries' },
    { name: 'erase_content', label: 'Erase entries' },
    { name: 'view_jobs', label: 'See background jobs' },
    { name: 'manage_collection_syncs', label: 'Manage collection syncs' },
    {
        name: 'view_sensitive',
        label: 'Read Sensitive fields',
        hint: 'Fields marked Sensitive that name no roles of their own.',
    },
    {
        name: 'view_hidden',
        label: 'Read Hidden fields',
        hint: 'Fields marked Hidden that name no roles of their own. Does not include Sensitive fields.',
    },
    {
        name: 'manage_all_files',
        label: "Open every user's files",
        hint: 'Files module. Without it a user reaches only their own private files.',
    },
];

/**
 * Capabilities that reach past one tenant. The API lets only a SuperAdmin give a user a role that
 * holds one (`PlatformRoles.PlatformCapabilities`), on the Users screen and in tenant membership.
 */
export const PLATFORM_CAPABILITIES: ReadonlySet<string> = new Set([
    '*',
    'manage_roles',
    'manage_tenants',
    'manage_users',
    'manage_email_settings',
    'view_hidden',
]);

export function isPlatformCapability(name: string): boolean {
    return PLATFORM_CAPABILITIES.has(name.toLowerCase());
}

/** The label for a capability name, or the name itself when this list does not know it. */
export function capabilityLabel(name: string): string {
    const lower = name.toLowerCase();
    return KNOWN_CAPABILITIES.find((c) => c.name === lower)?.label ?? name;
}

/** Whether a role's capability list holds this name, compared the way the API compares, without case. */
export function holdsCapability(capabilities: readonly string[], name: string): boolean {
    const lower = name.toLowerCase();
    return capabilities.some((c) => c.toLowerCase() === lower);
}
