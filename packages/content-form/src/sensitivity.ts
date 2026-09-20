import { SensitivityLevel, type FieldDefinition } from './definition';

/**
 * Whether the person looking at the screen may read and set a field.
 *
 * A copy of what barakoCMS enforces in `Infrastructure/Services/SensitivityService.cs`, and a copy
 * on purpose: the API publishes the definition, including `sensitivity` and `visibleToRoles`, but
 * not the decision it made about them. The read path masks the value (Redact to `***`, Remove drops
 * the key, Last4 keeps four characters) and the write path puts the stored value back over whatever
 * was sent. So a form that draws an editable box here is offering an edit the server discards
 * without saying anything.
 *
 * The default when a field names no `visibleToRoles` is the server's: HR for Sensitive, nobody but
 * SuperAdmin for Hidden.
 */
export function fieldIsVisibleTo(field: FieldDefinition, viewerRoles: readonly string[]): boolean {
    const level = field.sensitivity;
    if (!level || level === SensitivityLevel.Public) return true;
    if (viewerRoles.includes('SuperAdmin')) return true;

    const allowed =
        field.visibleToRoles && field.visibleToRoles.length > 0
            ? field.visibleToRoles
            : level === SensitivityLevel.Sensitive
              ? ['HR']
              : [];

    return allowed.some((role) => viewerRoles.includes(role));
}

/** What to tell somebody standing in front of a field they cannot read. */
export function maskedNotice(field: FieldDefinition): string {
    const level = field.sensitivity === SensitivityLevel.Hidden ? 'Hidden' : 'Sensitive';
    return `${level}. Your roles cannot read this field, so it is shown as the API sent it and cannot be changed here. Saving the entry leaves the stored value alone.`;
}
