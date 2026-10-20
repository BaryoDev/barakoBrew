import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { browserMark, osMark, deviceKind, markFor, MetricMark } from './marks';

describe('analytics marks', () => {
  it('maps known browsers to their vendor colour', () => {
    expect(browserMark('chrome')).toEqual({ letter: 'C', color: '#4285f4' });
    expect(browserMark('firefox')).toEqual({ letter: 'F', color: '#ff7139' });
    expect(browserMark('edge-chromium').letter).toBe('E');
    expect(browserMark('crios').letter).toBe('C');
  });

  it('maps known operating systems to their vendor colour', () => {
    expect(osMark('Windows 10')).toEqual({ letter: 'W', color: '#0078d4' });
    expect(osMark('Android OS').letter).toBe('A');
    expect(osMark('Mac OS').letter).toBe('M');
    expect(osMark('Linux').letter).toBe('L');
  });

  it('falls back to a neutral mark for an unknown browser or system', () => {
    const fallback = { letter: '?', color: '#6b7280' };
    expect(browserMark('netscape-navigator')).toEqual(fallback);
    expect(osMark('TempleOS')).toEqual(fallback);
    expect(browserMark('')).toEqual(fallback);
  });

  it('maps device names to a glyph kind and unknown names to the fallback glyph', () => {
    expect(deviceKind('desktop')).toBe('desktop');
    expect(deviceKind('Mobile')).toBe('mobile');
    expect(deviceKind('tablet')).toBe('tablet');
    expect(deviceKind('laptop')).toBe('laptop');
    expect(deviceKind('smart-fridge')).toBe('unknown');
  });

  it('draws marks only for browser, os and device cards', () => {
    expect(markFor('path', '/')).toBeNull();
    expect(markFor('referrer', 'google.com')).toBeNull();
    expect(markFor('country', 'PH')).toBeNull();
    expect(markFor('device', 'mobile')).toEqual({ kind: 'device', device: 'mobile' });
  });

  it('renders an 18px monogram in the vendor colour for a browser', () => {
    render(<MetricMark type="browser" name="firefox" />);
    const el = screen.getByTestId('monogram');
    expect(el).toHaveTextContent('F');
    expect(el.style.backgroundColor).not.toBe('');
    expect(el.className).toContain('size-[18px]');
  });

  it('renders a device glyph for a device and nothing for a path', () => {
    const { rerender } = render(<MetricMark type="device" name="tablet" />);
    expect(screen.getByTestId('device-glyph')).toHaveAttribute('data-device', 'tablet');
    rerender(<MetricMark type="path" name="/" />);
    expect(screen.queryByTestId('device-glyph')).toBeNull();
    expect(screen.queryByTestId('monogram')).toBeNull();
  });
});
