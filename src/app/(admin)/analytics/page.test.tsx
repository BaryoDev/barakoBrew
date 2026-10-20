import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

const rows: Record<string, Array<{ x: string; y: number }>> = {
  device: [{ x: 'mobile', y: 9 }, { x: 'smart-fridge', y: 1 }],
  browser: [{ x: 'chrome', y: 7 }, { x: 'netscape-navigator', y: 1 }],
  os: [{ x: 'Windows 10', y: 5 }],
  path: [{ x: '/', y: 4 }],
  referrer: [],
  country: [],
};

let series: {
  pageviews: Array<{ x: string; y: number }>;
  sessions: Array<{ x: string; y: number }>;
  previous?: { pageviews: Array<{ x: string; y: number }>; sessions: Array<{ x: string; y: number }> };
} = { pageviews: [], sessions: [] };

vi.mock('@/hooks/use-analytics', () => ({
  useAnalyticsWebsites: () => ({
    isError: false,
    isLoading: false,
    data: { configured: true, websites: [{ id: 'w1', name: 'Site', domain: 'example.com' }] },
  }),
  useAnalyticsSummary: () => ({ isLoading: false, data: undefined }),
  useAnalyticsSeries: () => ({ isLoading: false, data: series }),
  useAnalyticsMetric: (_id: string, type: string) => ({ isLoading: false, data: rows[type] }),
  useSiteStatus: () => ({ isLoading: false, data: { installed: true } }),
}));
vi.mock('@/components/analytics/add-website-dialog', () => ({ AddWebsiteDialog: () => null }));

const { default: AnalyticsPage } = await import('./page');

describe('the analytics page', () => {
  it('draws glyphs on the Devices card and monograms on the Browsers and OS cards', () => {
    render(React.createElement(AnalyticsPage));
    const glyphs = screen.getAllByTestId('device-glyph');
    expect(glyphs).toHaveLength(2);
    expect(glyphs.map((g) => g.getAttribute('data-device'))).toEqual(['mobile', 'unknown']);
    const monograms = screen.getAllByTestId('monogram');
    expect(monograms).toHaveLength(3);
    expect(monograms.map((m) => m.getAttribute('data-letter'))).toEqual(['W', 'C', '?']);
  });

  it('draws the previous period dashed behind the current line when the API returns it', () => {
    series = {
      pageviews: [{ x: 'a', y: 3 }, { x: 'b', y: 5 }],
      sessions: [],
      previous: { pageviews: [{ x: 'c', y: 2 }, { x: 'd', y: 9 }], sessions: [] },
    };
    render(React.createElement(AnalyticsPage));
    expect(screen.getByTestId('previous-line')).toBeTruthy();
    expect(screen.getByText('Previous period')).toBeTruthy();
  });

  it('says plainly that there is no previous period when the API does not return one', () => {
    series = { pageviews: [{ x: 'a', y: 3 }, { x: 'b', y: 5 }], sessions: [] };
    render(React.createElement(AnalyticsPage));
    expect(screen.queryByTestId('previous-line')).toBeNull();
    expect(screen.getByText('No previous period from this API')).toBeTruthy();
  });
});
