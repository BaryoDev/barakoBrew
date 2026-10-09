'use client';

import { ContentForm, JsonField, type FieldRenderProps, type Viewer } from 'barako-content-form';
import { MarkdownField } from '@/components/content/markdown-field';
import { ReferenceField } from '@/components/content/reference-field';
import { ChoiceField } from '@/components/content/choice-field';
import { MenuItemsField } from '@/components/content/menu-items-field';
import { BlocksField } from '@/components/content/blocks-field';
import { FileField } from '@/components/content/file-field';
import { InlineImageField } from '@/components/content/inline-image-field';
import { ReferenceListField } from '@/components/content/reference-list-field';
import { ImageUrlField } from '@/components/site/image-url-field';
import { FieldError } from '@/components/content/field-error';
import { isBlocksField } from '@/lib/blocks';
import { isMenuItemsField } from '@/lib/menu-tree';
import { chosenEditor } from '@/lib/field-presentation';
import type { ResolvedFile } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

export { JsonField };

export interface DynamicFormProps {
    fields: FieldDefinition[];
    values: Record<string, unknown>;
    onChange: (values: Record<string, unknown>) => void;
    errors?: Record<string, string>;
    /** The type the entry belongs to, which is how a menu's Items field gets the menu editor. */
    contentType?: string;
    /**
     * Who is editing, which decides whether a Sensitive or Hidden field is editable: `useAccess`'s
     * viewer, with the capabilities and role ids from `GET /api/me` when the API reports them. Left
     * off by the block editor, whose sub-forms come from the site's block schema and carry no
     * sensitivity; a screen editing a real entry passes it.
     */
    viewer?: Viewer;
    /**
     * The files the entry's `file` fields name, as the entry read resolved them, keyed as the field
     * is in the data. Absent on a create, and from an API older than file fields.
     */
    files?: Record<string, ResolvedFile>;
}

/** The resolved file for a field, found as the API keys it: by the name in the data, any case. */
function resolvedFile(files: Record<string, ResolvedFile> | undefined, name: string) {
    if (!files) return undefined;
    if (files[name]) return files[name];
    const key = Object.keys(files).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? files[key] : undefined;
}

/**
 * The console's content form: barako-content-form, plus the controls that need data it does not
 * fetch.
 *
 * The package owns the definition-to-control mapping and field sensitivity. What stays here is the
 * handful of fields whose control reaches into the console: a reference picker that searches
 * another type, the block editor built from the site's published schema, the menu tree, the choice
 * picker and the markdown composer.
 */
export function DynamicForm({
    fields,
    values,
    onChange,
    errors,
    contentType,
    viewer,
    files,
}: DynamicFormProps) {
    const renderField = ({ field, type, label, value, error, onChange: set }: FieldRenderProps) => {
        // The editor the field's hint names, or the one its name has always given it.
        const editor = chosenEditor(field, {
            isBlocks: isBlocksField,
            isMenu: (name) => isMenuItemsField(contentType, name),
        });

        if (type === 'reference' && field.multiple && field.referenceType?.trim()) {
            return (
                <ReferenceListField
                    field={field}
                    referenceType={field.referenceType.trim()}
                    label={label}
                    value={value}
                    error={error}
                    onChange={set}
                />
            );
        }

        // A reference is stored as the id of another entry, and the definition names the type that
        // id has to belong to, so it can be searched for instead of pasted. A definition with no
        // target names nothing to search, so that one keeps the id box the package gives it.
        if (type === 'reference' && field.referenceType?.trim()) {
            return (
                <ReferenceField
                    field={field}
                    referenceType={field.referenceType.trim()}
                    label={label}
                    value={value}
                    error={error}
                    onChange={set}
                />
            );
        }

        // A page's blocks, by the `blocks` hint, or for a field with none by the name barakoPress
        // reads them from. The editor is built from
        // the schema the site publishes, and falls back to the package's JSON editor when there is
        // none. docs/blocks.md is where a person setting up pages reads it.
        if (editor === 'blocks') {
            return (
                <BlocksField
                    displayName={field.displayName}
                    label={label}
                    value={value}
                    error={error}
                    onChange={set}
                    form={DynamicForm}
                    contentType={contentType}
                    json={
                        <JsonField
                            field={field}
                            type="array"
                            label={null}
                            value={value}
                            onChange={set}
                        />
                    }
                />
            );
        }

        if (type === 'choice') {
            return <ChoiceField field={field} value={value} error={error} onChange={set} />;
        }

        // By the `menu` hint, or for a field with none by convention: a menu's Items. docs/menus.md
        // is where a person modelling a menu reads it.
        if (editor === 'menu') {
            return (
                <MenuItemsField
                    fieldName={field.name}
                    displayName={field.displayName}
                    label={label}
                    value={value}
                    error={error}
                    onChange={set}
                    json={
                        <JsonField
                            field={field}
                            type="array"
                            label={null}
                            value={value}
                            onChange={set}
                        />
                    }
                />
            );
        }

        if (type === 'file') {
            return (
                <FileField
                    field={field}
                    label={label}
                    value={value}
                    error={error}
                    onChange={set}
                    resolved={resolvedFile(files, field.name)}
                    imagesOnly={editor === 'image'}
                />
            );
        }

        if (type === 'inlineimage') {
            return <InlineImageField field={field} label={label} value={value} error={error} onChange={set} />;
        }

        // A url or string field with the image hint holds an image's address: typed, or picked from
        // the public images in Files.
        if (editor === 'image' && (type === 'url' || type === 'string')) {
            return (
                <div className="space-y-1">
                    <ImageUrlField id={field.name} label={field.displayName} value={value} onChange={set} />
                    <FieldError message={error} />
                </div>
            );
        }

        // Markdown gets a composer whose preview renders the way barakoPress renders a post. The
        // value is still the text as typed. richtext stores HTML, and an editor for it waits on the
        // sanitising decision in #45, so it keeps the package's plain textarea.
        if (type === 'markdown') {
            return <MarkdownField field={field} label={label} value={value} error={error} onChange={set} />;
        }

        return null;
    };

    return (
        <ContentForm
            fields={fields}
            values={values}
            onChange={onChange}
            errors={errors}
            viewerRoles={viewer?.roles ?? []}
            viewerRoleIds={viewer?.roleIds}
            viewerCapabilities={viewer?.capabilities}
            renderField={renderField}
        />
    );
}
