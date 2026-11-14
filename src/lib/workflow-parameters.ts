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
 * Parameters an action accepts but does not require: the metadata's own `optionalParameters`, and
 * the parameters its example configuration names beyond the required ones. An older API lists no
 * optional parameters, and the example is where WebhookAction names its Secret.
 */
export function optionalParameters(meta: WorkflowActionMetadata | undefined): string[] {
    if (!meta) return [];
    const required = new Set(meta.requiredParameters);
    const listed = (meta.optionalParameters ?? []).filter((name) => !required.has(name));
    return [...new Set([...listed, ...fromExample(meta)])];
}

function fromExample(meta: WorkflowActionMetadata): string[] {
    if (!meta.exampleConfiguration) return [];
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

/**
 * A readable name for an action kind: "SendEmail" is "Send email", "HttpRequest" is "Http request".
 * The API sends no label of its own, so this is only the kind spelled as words, and a module's kind
 * gets the same treatment without the console knowing its name. A trailing "Action" is dropped.
 */
export function actionLabel(type: string): string {
    const words = type
        .replace(/Action$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim();
    if (!words) return type;
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** The label to show beside a kind, or null when it would only repeat the kind ("Webhook" beside "Webhook"). */
export function extraActionLabel(type: string): string | null {
    const label = actionLabel(type);
    return label.toLowerCase() === type.toLowerCase() ? null : label;
}
