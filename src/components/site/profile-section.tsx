'use client';

import { Section, TextField } from '@/components/site/editors';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isAbsoluteHttpUrl } from '@/lib/site-settings';
import type { ContentTypeDefinition } from '@/types/schema';

/**
 * The profile fields barakoCMS 4.6 moved from the tenant record to the site entry
 * (BaryoDev/barakoCMS#885). `Logo` was already here and stays under Images.
 */
export const PROFILE_FIELDS = ['About', 'Email', 'Location', 'LocationUrl', 'ContactUrl', 'SocialHandle'] as const;

const LINKS = new Set<string>(['LocationUrl', 'ContactUrl']);

const PLACEHOLDERS: Record<string, string> = {
    Email: 'hello@example.com',
    LocationUrl: 'https://maps.example.com/place',
    ContactUrl: 'https://example.com/contact',
    SocialHandle: '@example',
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * About and contact details. Each control shows only when the site type declares its field, so a
 * site type from before 4.6, or one that left a field out, gets no box whose value nothing reads.
 * Labels come from the type's own display names.
 */
export function SiteProfileSection({
    values,
    set,
    schema,
}: {
    values: Record<string, unknown>;
    set: (field: string, value: unknown) => void;
    schema: ContentTypeDefinition;
}) {
    const declared = PROFILE_FIELDS.map((name) => schema.fields.find((f) => f.name === name)).filter(
        (f): f is NonNullable<typeof f> => f !== undefined,
    );
    if (declared.length === 0) return null;

    return (
        <Section
            title="Profile"
            description="What this tenant's public profile says about it. The site reads it from here once the entry is published."
        >
            {declared.map((field) => {
                const id = `site-${field.name.toLowerCase()}`;
                const label = field.displayName || field.name;

                if (field.name === 'About') {
                    return (
                        <div key={field.name} className="space-y-1.5">
                            <Label htmlFor={id}>{label}</Label>
                            <Textarea
                                id={id}
                                rows={4}
                                value={text(values.About)}
                                onChange={(e) => set('About', e.target.value)}
                            />
                        </div>
                    );
                }

                const value = text(values[field.name]);
                const isLink = LINKS.has(field.name);
                return (
                    <TextField
                        key={field.name}
                        id={id}
                        label={label}
                        type={isLink ? 'url' : field.name === 'Email' ? 'email' : 'text'}
                        placeholder={PLACEHOLDERS[field.name]}
                        hint={isLink ? 'A full http or https address. The profile leaves out any other.' : undefined}
                        problem={
                            isLink && value.trim() !== '' && !isAbsoluteHttpUrl(value)
                                ? 'Use a full http or https address.'
                                : null
                        }
                        value={values[field.name]}
                        onChange={(v) => set(field.name, v)}
                    />
                );
            })}
        </Section>
    );
}
