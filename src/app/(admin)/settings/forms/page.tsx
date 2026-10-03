'use client';

import { toast } from 'sonner';
import { useSchemas } from '@/hooks/use-schemas';
import { useForms, useSetForm, type FormSettings, type SetFormInput } from '@/hooks/use-forms';
import { apiErrorMessage } from '@/lib/api';
import { formCandidates, supportsEmailVerification, verifiableEmailFields } from '@/lib/forms';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconList } from '@/components/icons';

const SELECT = 'h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-50 sm:w-56';

/**
 * Which content types take public submissions, and which of them verify an email address first.
 *
 * Every content type that could be a form is listed, since `GET /api/forms` lists only the ones
 * that are. Switching one on or off and choosing the field to verify each save at once.
 */
export default function FormsSettingsPage() {
    const schemas = useSchemas();
    const forms = useForms();
    const setForm = useSetForm();

    const save = (input: SetFormInput, done: string) =>
        setForm.mutate(input, {
            onSuccess: (result) => {
                if (input.verifyEmailField && !('verifyEmailField' in result)) {
                    toast.warning('Saved, but this API does not verify email addresses. It needs barakoCMS 4.6.');
                    return;
                }
                toast.success(done);
            },
            onError: (error) => toast.error(apiErrorMessage(error, 'The form could not be saved.')),
        });

    const header = (
        <PageHeader
            title="Forms"
            description="Content types that accept anonymous submissions from a site. A form can ask for a code sent to an email field before it accepts a submission."
        />
    );

    if (schemas.isLoading || forms.isLoading) {
        return (
            <>
                {header}
                <TableSkeleton />
            </>
        );
    }

    if (forms.data?.kind === 'absent') {
        return (
            <>
                {header}
                <EmptyState
                    icon={IconList}
                    title="Forms are not running here"
                    description="This API answers 404 for /api/forms, so the Forms module is not installed or not enabled."
                />
            </>
        );
    }

    if (schemas.isError || forms.isError || !forms.data || !schemas.data) {
        return (
            <>
                {header}
                <ErrorState
                    entity="forms"
                    onRetry={() => {
                        void schemas.refetch();
                        void forms.refetch();
                    }}
                />
            </>
        );
    }

    const byType = new Map<string, FormSettings>(forms.data.forms.map((f) => [f.contentType, f]));
    const canVerify = supportsEmailVerification(forms.data.forms);
    const types = formCandidates(schemas.data);

    if (types.length === 0) {
        return (
            <>
                {header}
                <EmptyState
                    icon={IconList}
                    title="No content type can be a form"
                    description="A form is a content type that holds many entries. Create one first."
                />
            </>
        );
    }

    return (
        <>
            {header}
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Content type</TableHead>
                            <TableHead>Accepts submissions</TableHead>
                            {canVerify && <TableHead>Verify email</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {types.map((type) => {
                            const form = byType.get(type.name);
                            const on = form !== undefined;
                            const label = type.displayName || type.name;
                            const emailFields = verifiableEmailFields(type);
                            return (
                                <TableRow key={type.name}>
                                    <TableCell>
                                        <span className="font-medium">{label}</span>
                                        <span className="text-muted-foreground block font-mono text-xs">{type.name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Switch
                                            checked={on}
                                            disabled={setForm.isPending}
                                            aria-label={`${label} accepts submissions`}
                                            onCheckedChange={(checked) =>
                                                // No verifyEmailField: turning a form back on restores the
                                                // field it verified before, as the API documents.
                                                save(
                                                    { contentType: type.name, enabled: checked },
                                                    checked ? `${label} now accepts submissions` : `${label} no longer accepts submissions`,
                                                )
                                            }
                                        />
                                    </TableCell>
                                    {canVerify && (
                                        <TableCell>
                                            {emailFields.length === 0 ? (
                                                <span className="text-muted-foreground text-xs">
                                                    No email field a visitor can fill in
                                                </span>
                                            ) : (
                                                <>
                                                    <select
                                                        aria-label={`Email field ${label} verifies`}
                                                        className={SELECT}
                                                        disabled={!on || setForm.isPending}
                                                        value={form?.verifyEmailField ?? ''}
                                                        onChange={(e) =>
                                                            save(
                                                                { contentType: type.name, enabled: true, verifyEmailField: e.target.value },
                                                                e.target.value
                                                                    ? `${label} now verifies ${e.target.value}`
                                                                    : `${label} no longer verifies an email address`,
                                                            )
                                                        }
                                                    >
                                                        <option value="">Do not verify</option>
                                                        {emailFields.map((field) => (
                                                            <option key={field.name} value={field.name}>
                                                                {field.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {!on && (
                                                        <span className="text-muted-foreground mt-1 block text-xs">
                                                            Switch the form on first.
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            {canVerify && (
                <p className="text-muted-foreground mt-3 max-w-2xl text-xs">
                    A verifying form makes its email field required and accepts a submission only with the code
                    the API mailed to that address. How long a code lasts and how many are sent per address, per
                    form and per visitor are set on the API under Modules:Forms:EmailVerification.
                </p>
            )}
        </>
    );
}
