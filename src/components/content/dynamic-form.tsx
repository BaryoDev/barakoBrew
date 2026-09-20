'use client';

import { ContentForm, JsonField, type FieldRenderProps } from 'barako-content-form';
import { MarkdownField } from '@/components/content/markdown-field';
import { ReferenceField } from '@/components/content/reference-field';
import { ChoiceField } from '@/components/content/choice-field';
import { MenuItemsField } from '@/components/content/menu-items-field';
import { BlocksField } from '@/components/content/blocks-field';
import { isBlocksField } from '@/lib/blocks';
import { isMenuItemsField } from '@/lib/menu-tree';
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
     * The roles of the person editing, which decide whether a sensitive field is editable. Left off
     * by the block editor, whose sub-forms come from the site's block schema and carry no
     * sensitivity; a screen editing a real entry passes the signed-in user's roles.
     */
    viewerRoles?: readonly string[];
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
    viewerRoles,
}: DynamicFormProps) {
    const renderField = ({ field, type, label, value, error, onChange: set }: FieldRenderProps) => {
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

        // A page's blocks, by the field name barakoPress reads them from. The editor is built from
        // the schema the site publishes, and falls back to the package's JSON editor when there is
        // none. docs/blocks.md is where a person setting up pages reads it.
        if (type === 'json' && isBlocksField(field.name)) {
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

        // By convention rather than by a hint on the definition, which the API has no place for
        // yet. docs/menus.md is where a person modelling a menu reads it.
        if (type === 'json' && isMenuItemsField(contentType, field.name)) {
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
            viewerRoles={viewerRoles ?? []}
            renderField={renderField}
        />
    );
}
