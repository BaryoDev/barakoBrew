import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';
import { api } from '@/lib/api';
import { useFileBlob } from './use-files';

const originalAdapter = api.defaults.adapter;

afterEach(() => {
    api.defaults.adapter = originalAdapter;
});

function record(seen: InternalAxiosRequestConfig[]) {
    api.defaults.adapter = async (config) => {
        seen.push(config);
        return { data: new Blob(['x']), status: 200, statusText: 'OK', headers: {}, config };
    };
}

describe('useFileBlob', () => {
    it('sets no client timeout for a file download, while any other GET keeps the 30 second one', async () => {
        const seen: InternalAxiosRequestConfig[] = [];
        record(seen);
        const client = new QueryClient();
        const { result } = renderHook(() => useFileBlob('/api/files/f-1/content'), {
            wrapper: ({ children }) => React.createElement(QueryClientProvider, { client }, children),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(seen).toHaveLength(1);
        expect(seen[0].url).toBe('/api/files/f-1/content');
        expect(seen[0].responseType).toBe('blob');
        expect(seen[0].timeout).toBe(0);

        await api.get('/api/content-types');
        expect(seen).toHaveLength(2);
        expect(seen[1].timeout).toBe(30000);
    });
});
