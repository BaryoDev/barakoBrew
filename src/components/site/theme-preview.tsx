'use client';

import type { CSSProperties } from 'react';
import { parseHex } from '@/lib/contrast';
import { isCssLength, type SiteLink } from '@/lib/site-settings';

/** What an unset or unreadable slot is drawn with here. barakoPress has its own defaults. */
export const FALLBACK: Record<string, string> = {
    pageBg: '#ffffff',
    surface: '#f6f6f4',
    ink: '#1c1c1c',
    proseInk: '#2b2b2b',
    secondaryInk: '#555555',
    muted: '#6b6b6b',
    hairline: '#e3e3e0',
    accent: '#17458f',
    accentHover: '#12376f',
    accentInk: '#ffffff',
    accentTint: '#edf2fa',
    accentTintBorder: '#c7d4ea',
    darkPanel: '#15181d',
    darkPanelInk: '#f1f1f1',
    darkPanelAccent: '#f7a81b',
};

function family(name: string | undefined, fallback: string) {
    return name?.trim() ? `"${name.trim().replace(/"/g, '')}", ${fallback}` : fallback;
}

function length(value: string | undefined, fallback: string) {
    return value && isCssLength(value) ? value : fallback;
}

/**
 * A sample header, card, band and prose block drawn in the theme being edited.
 *
 * An approximation of barakoPress, not a render of it: it shows what the colours, fonts and radii
 * do to each other before anything is saved. Fonts show only when the browser already has them,
 * since the console loads nothing from Google Fonts.
 */
export function ThemePreview({
    colors,
    fonts,
    radii,
    layout,
    name,
    tagline,
    links,
    topBar,
}: {
    colors: Record<string, string>;
    fonts: Record<string, string>;
    radii: Record<string, string>;
    layout: Record<string, string>;
    name: string;
    tagline: string;
    links: readonly SiteLink[];
    topBar: string;
}) {
    const c = (slot: string) => (parseHex(colors[slot]) ? colors[slot] : FALLBACK[slot]);
    const heading = family(fonts.heading, 'Georgia, serif');
    const body = family(fonts.body, 'system-ui, sans-serif');
    const mono = family(fonts.mono, 'ui-monospace, monospace');
    const panel = length(radii.panel, '8px');
    const control = length(radii.control, '6px');
    const pill = length(radii.pill, '999px');

    const button: CSSProperties = {
        background: c('accent'),
        color: c('accentInk'),
        borderRadius: control,
        padding: '6px 14px',
        fontWeight: 600,
        fontSize: 13,
    };

    return (
        <div
            data-testid="theme-preview"
            aria-label="Theme preview"
            role="img"
            className="overflow-hidden rounded-xl border"
            style={{ background: c('pageBg'), color: c('ink'), fontFamily: body }}
        >
            {topBar && (
                <div style={{ background: c('darkPanel'), color: c('darkPanelInk'), fontSize: 12, padding: '4px 16px' }}>
                    {topBar}
                </div>
            )}
            <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                style={{ borderBottom: `1px solid ${c('hairline')}` }}
            >
                <div>
                    <div style={{ fontFamily: heading, fontWeight: 700, fontSize: 18 }}>{name || 'Site name'}</div>
                    {tagline && <div style={{ color: c('secondaryInk'), fontSize: 12 }}>{tagline}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 13 }}>
                    {(links.length ? links : [{ label: 'About', href: '/about' }]).slice(0, 4).map((link, i) => (
                        <span key={i} style={{ color: c('accent') }}>
                            {link.label || 'Link'}
                        </span>
                    ))}
                    <span data-testid="preview-button" style={button}>
                        Donate
                    </span>
                </div>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div
                    style={{
                        background: c('surface'),
                        border: `1px solid ${c('hairline')}`,
                        borderRadius: panel,
                        padding: 16,
                    }}
                >
                    <span
                        style={{
                            background: c('accentTint'),
                            border: `1px solid ${c('accentTintBorder')}`,
                            color: c('ink'),
                            borderRadius: pill,
                            padding: '2px 10px',
                            fontSize: 11,
                        }}
                    >
                        Clean water
                    </span>
                    <div style={{ fontFamily: heading, fontWeight: 700, fontSize: 16, marginTop: 10 }}>
                        A card heading
                    </div>
                    <p style={{ color: c('secondaryInk'), fontSize: 13, marginTop: 4 }}>
                        Secondary text on a card, with <span style={{ color: c('accent') }}>a link</span>.
                    </p>
                </div>

                <div style={{ background: c('darkPanel'), color: c('darkPanelInk'), borderRadius: panel, padding: 16 }}>
                    <div style={{ fontFamily: heading, fontWeight: 700, fontSize: 16 }}>A dark band</div>
                    <p style={{ fontSize: 13, marginTop: 4 }}>
                        Text on the band, and <span style={{ color: c('darkPanelAccent') }}>its accent</span>.
                    </p>
                </div>
            </div>

            <article
                className="px-4 pb-5"
                style={{ maxWidth: `min(${length(layout.prose, '680px')}, 100%)`, color: c('proseInk') }}
            >
                <div style={{ fontFamily: heading, fontWeight: 700, fontSize: 20 }}>A prose heading</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>
                    Article text sits at the prose width. A <span style={{ color: c('accent') }}>link in the text</span>{' '}
                    and <code style={{ fontFamily: mono, color: c('muted') }}>code</code> show against the page.
                </p>
                <p style={{ color: c('muted'), fontSize: 12, marginTop: 6 }}>A muted caption.</p>
            </article>
        </div>
    );
}
