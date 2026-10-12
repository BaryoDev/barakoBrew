import { z } from 'zod';
import { resolveFieldType, type FieldDefinition } from '@/types/schema';
import { hasOptionIssues, optionIssues } from '@/lib/choice';
import { currencyProblem, sectionProblem, tokenLengthProblem } from '@/lib/field-presentation';

/** The backend requires PascalCase field names (FieldTypeValidator). */
export const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

export const numberText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/**
 * Every rule the field designer holds a field to before it can be added, as one schema for
 * react-hook-form's resolver.
 *
 * `others` is the rest of the type's fields, without the one being edited, since a name and a role
 * are unique across the type. The checks are the helpers the other designer panels already use, so a
 * message here reads the same as it does there.
 *
 * Each issue is filed under the member the person has to change, which is where the form shows it.
 * The money rules are filed under `currency` for both inputs, because a scale without a currency is
 * fixed by setting the currency.
 */
export function fieldFormSchema(others: readonly FieldDefinition[]) {
    return z
        .custom<FieldDefinition>((value) => typeof value === 'object' && value !== null)
        .superRefine((field, ctx) => {
            const issue = (path: keyof FieldDefinition, message: string) =>
                ctx.addIssue({ code: 'custom', path: [path], message });
            const type = resolveFieldType(field.type);

            if (!field.displayName) issue('displayName', 'Give the field a display name.');

            if (!field.name) issue('name', 'Give the field an API name.');
            else if (!PASCAL_CASE.test(field.name)) {
                issue('name', 'Use PascalCase: start with a capital letter, letters and numbers only.');
            } else if (others.some((f) => f.name.toLowerCase() === field.name.toLowerCase())) {
                // Ignoring case, as barakoCMS 4.7 refuses it: every reader finds a field by its name ignoring case.
                issue('name', 'A field with this name already exists, ignoring case.');
            }

            // The options editor shows what is wrong with each option itself.
            if (type === 'choice' && hasOptionIssues(optionIssues(field.options ?? []))) {
                issue('options', 'Fix the options before adding the field.');
            }

            // The API refuses a reference that names no target.
            if (type === 'reference' && !field.referenceType?.trim()) {
                issue('referenceType', 'Name the content type the entries are picked from.');
            }

            const section = sectionProblem(field.section ?? '');
            if (section) issue('section', section);

            if (type === 'money') {
                const currency = currencyProblem(field.currency ?? '', numberText(field.scale));
                if (currency) issue('currency', currency);
            }

            if (type === 'token') {
                const length = tokenLengthProblem(numberText(field.tokenLength));
                if (length) issue('tokenLength', length);
            }

            const holder = field.role ? others.find((f) => f.role === field.role) : undefined;
            if (holder) {
                issue('role', `${holder.displayName} already holds this role. One field of a type holds a role.`);
            }
        });
}
