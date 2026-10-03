/**
 * Which content types can be forms, and which of their fields can be verified, by the rules
 * BarakoCMS.Forms applies. The API still refuses what it refuses; these keep the screen from
 * offering a choice it would refuse.
 */

interface FieldLike {
    name: string;
    type: string;
    sensitivity?: string;
}

interface TypeLike {
    name: string;
    displayName?: string;
    isSingleton?: boolean;
    fields: FieldLike[];
}

/** A single-entry type is refused as a form: it could take only one submission. */
export function formCandidates<T extends TypeLike>(types: readonly T[] | undefined): T[] {
    return (types ?? []).filter((t) => t.isSingleton !== true);
}

/**
 * The fields `verifyEmailField` may name: of type `email`, Public (a visitor can fill it in), and
 * not the slug. The same test as `FormEmailVerifier.EmailField`.
 */
export function verifiableEmailFields(type: TypeLike): FieldLike[] {
    return type.fields.filter(
        (f) =>
            f.type.toLowerCase() === 'email' &&
            (f.sensitivity ?? 'Public') === 'Public' &&
            f.name.toLowerCase() !== 'slug',
    );
}

/**
 * Whether this API can verify a form's email field. The field arrived with it, so a list where a
 * form carries `verifyEmailField` (even null) says yes. With no forms yet there is nothing to read,
 * and the screen offers the choice; an older API then ignores it, which the save reports.
 */
export function supportsEmailVerification(forms: readonly object[]): boolean {
    return forms.length === 0 || forms.some((f) => 'verifyEmailField' in f);
}
