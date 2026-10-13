import axios from 'axios';

/**
 * Whether the API refused because a field change is running on the content type.
 *
 * From contract 8 every edit to a type's definition answers 409 while a field change (a rename, or a
 * sensitivity change on a large type) runs on it. That refusal names the route's `name` value, where
 * a refusal that can be overridden with `force` (options entries hold, amounts that do not fit,
 * duplicates under a rule) is a general error. Sending `force` does not get past this one: it
 * clears when the change completes.
 */
export function isFieldChangeRunning(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 409) return false;
    const errors = (error.response.data as { errors?: unknown } | undefined)?.errors;
    return Array.isArray(errors) && errors.some((e) => (e as { name?: unknown } | null)?.name === 'name');
}

/** A 409 a dialog may offer to resend with `force`: any 409 but a field change running. */
export function isForceableConflict(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 409 && !isFieldChangeRunning(error);
}
