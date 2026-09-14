'use client';

import { SiteForm } from '@/components/site/site-form';
import { ShareLinksPanel } from '@/components/site/share-links-panel';
import { SiteModeSection } from '@/components/site/site-mode-section';
import { ImageUrlField } from '@/components/site/image-url-field';
import { LinkList, PairList, Section, Structured, TextField } from '@/components/site/editors';
import { Button } from '@/components/ui/button';
import { IconPlus, IconTrash } from '@/components/icons';
import {
    isAbsoluteHttpUrl,
    readFooterColumns,
    readLinks,
    readSocialLinks,
    readTopBar,
    siteProblem,
    type FooterColumn,
} from '@/lib/site-settings';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export default function SitePage() {
    return (
        <SiteForm
            title="Site"
            description="This tenant's name, mode, images, header, footer and social links, read by the site on each request."
            problem={siteProblem}
        >
            {({ values, set, entry, schema }) => (
                <>
                    <Section title="Identity">
                        <TextField id="site-name" label="Site name (required)" value={values.Name} onChange={(v) => set('Name', v)} />
                        <TextField id="site-tagline" label="Tagline" value={values.Tagline} onChange={(v) => set('Tagline', v)} />
                        <TextField
                            id="site-url"
                            label="Site address"
                            type="url"
                            placeholder="https://example.com"
                            hint="The site's canonical origin. Absolute links are built from it."
                            problem={
                                text(values.Url).trim() !== '' && !isAbsoluteHttpUrl(text(values.Url))
                                    ? 'Use a full http or https address.'
                                    : null
                            }
                            value={values.Url}
                            onChange={(v) => set('Url', v)}
                        />
                        <TextField
                            id="site-locale"
                            label="Locale"
                            placeholder="en-PH"
                            hint="For dates and the page language."
                            value={values.Locale}
                            onChange={(v) => set('Locale', v)}
                        />
                        <TextField
                            id="site-copyright"
                            label="Copyright line"
                            value={values.Copyright}
                            onChange={(v) => set('Copyright', v)}
                        />
                    </Section>

                    <SiteModeSection values={values} set={set} schema={schema} />

                    <Section title="Images" description="Uploaded files or any absolute address.">
                        <ImageUrlField id="site-logo" label="Logo" value={values.Logo} onChange={(v) => set('Logo', v)} />
                        <TextField
                            id="site-logo-alt"
                            label="Logo alt text"
                            hint="What a screen reader says for the logo."
                            value={values.LogoAlt}
                            onChange={(v) => set('LogoAlt', v)}
                        />
                        <ImageUrlField
                            id="site-footer-logo"
                            label="Footer logo"
                            value={values.FooterLogo}
                            onChange={(v) => set('FooterLogo', v)}
                        />
                        <ImageUrlField id="site-favicon" label="Favicon" value={values.Favicon} onChange={(v) => set('Favicon', v)} />
                        <ImageUrlField
                            id="site-share-image"
                            label="Default share image"
                            value={values.ShareImage}
                            onChange={(v) => set('ShareImage', v)}
                        />
                    </Section>

                    <Section title="Top bar" description="The strip above the header. Leave it empty for none.">
                        <Structured
                            field="TopBar"
                            label="Top bar"
                            value={values.TopBar}
                            read={readTopBar}
                            onChange={(v) => set('TopBar', v)}
                        >
                            {(top) => (
                                <div className="space-y-3">
                                    <TextField
                                        id="site-topbar-text"
                                        label="Top bar text"
                                        value={top.text}
                                        onChange={(v) => set('TopBar', { ...top, text: v })}
                                    />
                                    <LinkList links={top.links} onChange={(links) => set('TopBar', { ...top, links })} />
                                </div>
                            )}
                        </Structured>
                    </Section>

                    <Section title="Header links" description="Links in the header beyond the page tree.">
                        <Structured
                            field="HeaderLinks"
                            label="Header links"
                            value={values.HeaderLinks}
                            read={readLinks}
                            onChange={(v) => set('HeaderLinks', v)}
                        >
                            {(links) => <LinkList links={links} onChange={(next) => set('HeaderLinks', next)} />}
                        </Structured>
                    </Section>

                    <Section title="Footer columns">
                        <Structured
                            field="FooterColumns"
                            label="Footer columns"
                            value={values.FooterColumns}
                            read={readFooterColumns}
                            onChange={(v) => set('FooterColumns', v)}
                        >
                            {(columns) => (
                                <FooterColumns columns={columns} onChange={(next) => set('FooterColumns', next)} />
                            )}
                        </Structured>
                    </Section>

                    <Section title="Social links">
                        <Structured
                            field="SocialLinks"
                            label="Social links"
                            value={values.SocialLinks}
                            read={readSocialLinks}
                            onChange={(v) => set('SocialLinks', v)}
                        >
                            {(social) => (
                                <PairList
                                    items={social}
                                    onChange={(next) => set('SocialLinks', next)}
                                    noun="profile"
                                    hrefKey="href"
                                    blank={{ network: '', href: '' }}
                                    columns={[
                                        { key: 'network', label: 'Network', placeholder: 'facebook' },
                                        { key: 'href', label: 'Profile link', placeholder: 'https://facebook.com/…' },
                                    ]}
                                />
                            )}
                        </Structured>
                    </Section>

                    <ShareLinksPanel siteUrl={entry?.data?.Url} />
                </>
            )}
        </SiteForm>
    );
}

function FooterColumns({
    columns,
    onChange,
}: {
    columns: readonly FooterColumn[];
    onChange: (columns: FooterColumn[]) => void;
}) {
    const update = (index: number, column: FooterColumn) =>
        onChange(columns.map((c, i) => (i === index ? column : c)));

    return (
        <div className="space-y-3">
            {columns.length === 0 && (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">No columns yet.</p>
            )}
            {columns.map((column, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <TextField
                                id={`site-footer-${index}-heading`}
                                label={`Column ${index + 1} heading`}
                                value={column.heading}
                                onChange={(heading) => update(index, { ...column, heading })}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove column ${index + 1}`}
                            onClick={() => onChange(columns.filter((_, i) => i !== index))}
                        >
                            <IconTrash />
                        </Button>
                    </div>
                    <LinkList links={column.links} onChange={(links) => update(index, { ...column, links })} />
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...columns, { heading: '', links: [] }])}
            >
                <IconPlus />
                Add column
            </Button>
        </div>
    );
}
