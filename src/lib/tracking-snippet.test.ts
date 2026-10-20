import { describe, expect, it } from 'vitest';
import { withDataDomains } from './tracking-snippet';

const snippet =
  '<script defer src="https://playground.baryo.dev/analytics/script.js" data-website-id="abc"></script>';

describe('withDataDomains', () => {
  it('adds the site domain to the script tag', () => {
    const out = withDataDomains(snippet, 'example.com');
    expect(out).toContain('data-domains="example.com"');
    expect(out).toContain('data-website-id="abc"');
    expect(out.startsWith('<script data-domains="example.com" defer')).toBe(true);
  });

  it('leaves a snippet that already has data-domains alone', () => {
    const has = snippet.replace('<script', '<script data-domains="a.com"');
    expect(withDataDomains(has, 'example.com')).toBe(has);
  });

  it('leaves the snippet alone when there is no domain', () => {
    expect(withDataDomains(snippet, '  ')).toBe(snippet);
  });

  it('drops characters that could break out of the attribute', () => {
    const out = withDataDomains(snippet, 'a.com"><script>x');
    expect(out).toContain('data-domains="a.comscriptx"');
    expect(out).not.toContain('"><script>x');
  });
});
