import axios from 'axios';
import { apiErrorMessage } from '@/lib/api';

/**
 * Whether the caller may change a user's global roles (`/api/users/{id}/roles`).
 *
 * From API contract 5 the server needs the caller's own capability to come from a global role, not a
 * tenant membership. The token carries effective roles, so an Admin in it may be Admin of one tenant
 * only. SuperAdmin is never a membership role, so it is the one role the console can trust here.
 */
export function canChangeGlobalRoles(roles: readonly string[] | undefined): boolean {
    return roles?.includes('SuperAdmin') ?? false;
}

/** The API's own words when it gave any, and a reason that says who may do this on a bare 403. */
export function roleChangeErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string' && detail) return detail;
        const data = error.response?.data;
        const hasMessage = (typeof data === 'string' && data) || data?.message || data?.errors;
        if (error.response?.status === 403 && !hasMessage) {
            return 'Only a platform administrator can change global roles. Give roles inside a tenant from its members list.';
        }
    }
    return apiErrorMessage(error, 'The role could not be changed.');
}
