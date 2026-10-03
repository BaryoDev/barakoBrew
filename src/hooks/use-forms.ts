'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isNotFound, type Paginated } from '@/lib/api';

/**
 * One content type that takes public submissions, as `GET /api/forms` and `PUT /api/forms/{type}`
 * answer (BarakoCMS.Forms, `FormResponse`). Both routes need `manage_forms`, which Admin holds by
 * default.
 */
export interface FormSettings {
    contentType: string;
    enabled: boolean;
    enabledAt?: string | null;
    /**
     * The email field a visitor proves with an emailed code before a submission is accepted, or null.
     * Absent from a Forms module before barakoCMS 4.6, which cannot verify.
     */
    verifyEmailField?: string | null;
}

export type FormsState = { kind: 'absent' } | { kind: 'forms'; forms: FormSettings[] };

/** The largest page the API serves. A deployment with more forms than this is not one this screen pages through. */
const PAGE_SIZE = 100;

/** A 404 is a deployment without the Forms module, which is a fact to show, not an error. */
export function useForms() {
    return useQuery({
        queryKey: ['forms'],
        queryFn: async (): Promise<FormsState> => {
            try {
                const { data } = await api.get<Paginated<FormSettings>>('/api/forms', {
                    params: { page: 1, pageSize: PAGE_SIZE },
                });
                return { kind: 'forms', forms: data.items ?? [] };
            } catch (error) {
                if (isNotFound(error)) return { kind: 'absent' };
                throw error;
            }
        },
    });
}

export interface SetFormInput {
    contentType: string;
    enabled: boolean;
    /**
     * Left out keeps what the form verifies. An empty string turns verification off. A field name
     * turns it on for that field.
     */
    verifyEmailField?: string;
}

export function useSetForm() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ contentType, ...body }: SetFormInput) =>
            (await api.put<FormSettings>(`/api/forms/${encodeURIComponent(contentType)}`, body)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms'] }),
    });
}
