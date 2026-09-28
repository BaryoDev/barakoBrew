import axios from 'axios';
import { apiErrorMessage } from '@/lib/api';

/**
 * What to say when `/api/users/{id}/roles` refuses a change.
 *
 * From API contract 5 the server needs the caller's own capability to come from a global role, not a
 * tenant membership. The token carries effective roles, so the console cannot tell a global Admin,
 * who may still change these roles, from an Admin of one tenant, who may not. The controls stay and
 * the API decides. Its own words win when it sent any; a bare 403 says who may do this and where a
 * tenant Admin gives roles instead.
 */
export function roleChangeErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        if (typeof data?.detail === 'string' && data.detail) return data.detail;
        const hasMessage = (typeof data === 'string' && data) || data?.message || data?.errors;
        if (error.response?.status === 403 && !hasMessage) {
            return 'Only a platform administrator can change global roles. To give a role in your tenant, use Members on the Tenants screen.';
        }
    }
    return apiErrorMessage(error, 'The role could not be changed.');
}
