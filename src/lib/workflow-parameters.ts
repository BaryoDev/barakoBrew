import type { WorkflowActionMetadata } from '@/types/workflow';

export interface ParameterField {
    name: string;
    required: boolean;
    secret: boolean;
}

// The same list the API redacts on read (WebhookSigning.IsSensitiveParameterName), so anything the
// API will never show again is masked while it is typed.
const SENSITIVE_NAME_PARTS = [
    'secret', 'password', 'passwd', 'pwd', 'token', 'apikey', 'api_key',
    'credential', 'privatekey', 'private_key', 'accesskey', 'access_key',
];

export function isSecretParameter(name: string): boolean {
    const lower = name.toLowerCase();
    return SENSITIVE_NAME_PARTS.some((part) => lower.includes(part));
}

/**
 * Parameters an action accepts but does not require.
 *
 * The action metadata lists required parameters only, so these are read from the example
 * configuration the API publishes with it. That is where WebhookAction names its Secret.
 */
export function optionalParameters(meta: WorkflowActionMetadata | undefined): string[] {
    if (!meta?.exampleConfiguration) return [];
    let example: unknown;
    try {
        example = JSON.parse(meta.exampleConfiguration);
    } catch {
        return [];
    }
    const parameters = (example as { Parameters?: unknown } | null)?.Parameters;
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return [];
    const required = new Set(meta.requiredParameters);
    return Object.keys(parameters).filter((name) => !required.has(name));
}

export function parameterFields(
    meta: WorkflowActionMetadata | undefined,
    current: Record<string, string>
): ParameterField[] {
    const required = meta?.requiredParameters ?? [];
    const names = [...new Set([...required, ...optionalParameters(meta), ...Object.keys(current)])];
    return names.map((name) => ({
        name,
        required: required.includes(name),
        secret: isSecretParameter(name),
    }));
}

/** Drops optional parameters left blank, so an untouched Secret is not sent as an empty string. */
export function withoutBlankOptional(
    parameters: Record<string, string>,
    meta: WorkflowActionMetadata | undefined
): Record<string, string> {
    const required = new Set(meta?.requiredParameters ?? []);
    return Object.fromEntries(
        Object.entries(parameters).filter(([name, value]) => required.has(name) || value.trim() !== '')
    );
}
