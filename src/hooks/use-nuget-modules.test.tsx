import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNugetModules } from './use-nuget-modules';

describe('useNugetModules', () => {
    it('hands React Query signal to the request, so leaving the page cancels it', async () => {
        let sent: AbortSignal | undefined;
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init: RequestInit) => {
                sent = init.signal ?? undefined;
                return new Promise(() => {});
            }),
        );
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        const { unmount } = renderHook(() => useNugetModules(true), { wrapper });
        await waitFor(() => expect(sent).toBeDefined());
        expect(sent!.aborted).toBe(false);
        unmount();
        await waitFor(() => expect(sent!.aborted).toBe(true));
    });
});
