import type { WorkflowActionMetadata } from '@/types/workflow';
import { readsAsCredential } from '@/lib/credential-names';

export interface ParameterField {
    name: string;
    required: boolean;
    secret: boolean;
}

/**
 * Whether a parameter is masked while it is typed, by the console's copy of the credential words.
 * `parameterFields` takes the API's own list (`credentialNameParts`) when it has one. The API never
 * shows such a value again once saved.
 */
export function isSecretParameter(name: string): boolean {
    return readsAsCredential(name);
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
    current: Record<string, string>,
    credentialParts?: readonly string[],
): ParameterField[] {
    const required = meta?.requiredParameters ?? [];
    const names = [...new Set([...required, ...optionalParameters(meta), ...Object.keys(current)])];
    return names.map((name) => ({
        name,
        required: required.includes(name),
        secret: readsAsCredential(name, credentialParts),
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
