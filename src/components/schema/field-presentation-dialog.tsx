'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useSetFieldPresentation } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { editorsFor, rolesFor, sectionProblem } from '@/lib/field-presentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { FieldDefinition } from '@/types/schema';

const NONE = '__none';

/**
 * Sets the editor hint, section and role of a field on a type that already exists.
 *
 * The three are sent together, as the endpoint takes them: one left out would be cleared. None of
 * them changes what an entry may hold, so no entry is read or written.
 */
export function FieldPresentationDialog({
    typeName,
    field,
    open,
    onOpenChange,
}: {
    typeName: string;
    field: FieldDefinition;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [editor, setEditor] = useState(field.editor ?? '');
    const [section, setSection] = useState(field.section ?? '');
    const [role, setRole] = useState(field.role ?? '');
    const [refusal, setRefusal] = useState<string | null>(null);
    const setPresentation = useSetFieldPresentation(typeName, field.name);

    const editors = editorsFor(field.type);
    const roles = rolesFor(field.type);
    const sectionIssue = sectionProblem(section);

    const save = () =>
        setPresentation.mutate(
            { editor: editor || null, section: section || null, role: role || null },
            {
                onSuccess: () => {
                    toast.success(`${field.displayName} saved`);
                    onOpenChange(false);
                },
                // Kept in the dialog: a role another field holds is refused naming that field, and
                // the person needs to read it while deciding what to do.
                onError: (error) => setRefusal(apiErrorMessage(error, 'The field could not be saved.')),
            },
        );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>How {field.displayName} is edited</DialogTitle>
                    <DialogDescription>
                        The section groups fields on the edit screen, the editor picks the control, and the
                        role tells the feed and the SEO block what the field is. No entry changes.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="presentation-section">Section</Label>
                        <Input
                            id="presentation-section"
                            value={section}
                            placeholder="Details"
                            onChange={(e) => {
                                setRefusal(null);
                                setSection(e.target.value);
                            }}
                        />
                        {sectionIssue && <p className="text-destructive text-xs">{sectionIssue}</p>}
                    </div>
                    {editors.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="presentation-editor">Editor</Label>
                            <Select
                                value={editor || NONE}
                                onValueChange={(v) => {
                                    setRefusal(null);
                                    setEditor(v === NONE ? '' : v);
                                }}
                            >
                                <SelectTrigger id="presentation-editor" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Pick by type and name</SelectItem>
                                    {editors.map((e) => (
                                        <SelectItem key={e.name} value={e.name}>
                                            {e.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {roles.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="presentation-role">Role</Label>
                            <Select
                                value={role || NONE}
                                onValueChange={(v) => {
                                    setRefusal(null);
                                    setRole(v === NONE ? '' : v);
                                }}
                            >
                                <SelectTrigger id="presentation-role" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>None</SelectItem>
                                    {roles.map((r) => (
                                        <SelectItem key={r.name} value={r.name}>
                                            {r.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                {refusal && (
                    <p role="alert" className="text-destructive text-sm">
                        {refusal}
                    </p>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={!!sectionIssue || setPresentation.isPending} onClick={save}>
                        {setPresentation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
