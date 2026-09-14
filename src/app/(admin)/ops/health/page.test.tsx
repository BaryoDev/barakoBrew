import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: {
      get: vi.fn(),
    },
  };
});

const { api } = await import('@/lib/api');
const { default: HealthPage } = await import('./page');

function httpError(status: number) {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');

  error.response = {
    data: {},
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };

  return error;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <HealthPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('Kubernetes health panel', () => {
  it('hides the Kubernetes panel when the API returns 404', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/monitoring/k8s') {
        throw httpError(404);
      }

      if (url === '/api/monitoring/health') {
        return {
          data: {
            status: 'Healthy',
            entries: {},
          },
        };
      }

      if (url === '/api/monitoring/metrics') {
        return {
          data: {
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            errorRate: 0,
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderPage();

    await screen.findByText('Health');

    await waitFor(() => {
      expect(screen.queryByText('Kubernetes')).not.toBeInTheDocument();
    });
  });

  it('shows an error and retry button when the Kubernetes API fails with a non-404 error', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/monitoring/k8s') {
        throw httpError(500);
      }

      if (url === '/api/monitoring/health') {
        return {
          data: {
            status: 'Healthy',
            entries: {},
          },
        };
      }

      if (url === '/api/monitoring/metrics') {
        return {
          data: {
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            errorRate: 0,
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderPage();

    expect(await screen.findByText('Kubernetes')).toBeInTheDocument();

    expect(
      await screen.findByText('Could not load Kubernetes status.'),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
  });
});