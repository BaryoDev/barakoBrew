/**
 * Adds Umami's `data-domains` attribute to the script tag so the tracker only reports from the
 * site's own domain. A build on localhost or a preview host then sends nothing. A snippet that
 * already carries the attribute is left alone.
 */
export function withDataDomains(snippet: string, domain: string): string {
  const host = domain.trim();
  if (!host || /\sdata-domains\s*=/i.test(snippet)) return snippet;
  const safe = host.replace(/[&"<>]/g, '');
  if (!safe) return snippet;
  return snippet.replace(/<script\b/i, `<script data-domains="${safe}"`);
}
