'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { useAddField, type AddFieldRequest } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { hasOptionIssues, optionIssues } from '@/lib/choice';
import { PASCAL_CASE } from '@/lib/field-form';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FieldError } from '@/components/content/field-error';
import { OptionsEditor } from '@/components/schema/options-editor';
import { IconPlus } from '@/components/icons';
import {
  FIELD_TYPES,
  FIELD_TYPE_GROUPS,
  type FieldDefinition,
  type FieldOption,
  type FieldType,
} from '@/types/schema';

const SELECT =
  'border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]';

/** "Cover image" to "CoverImage", the PascalCase the API requires of a field name. */
function toFieldName(display: string): string {
  return display
    .replace(/[^A-Za-z0-9\s_-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
}

/**
 * The Add a field panel: every type the API accepts, in the design's groups, and a small form for
 * the one chosen. Posts to POST /api/content-types/{name}/fields. The API decides what is allowed
 * (a name already taken, a required field with no default on a type that has entries), and its
 * message is shown as it words it.
 *
 * Types that need more than a name carry it: a reference needs its target type, a choice its
 * options, a list the type of its items. Everything else the API takes beyond those, such as a
 * currency or an editor, is set from the field's own dialogs once it exists.
 */
export function AddFieldPanel({
  typeName,
  fields,
  contentTypes,
}: {
  typeName: string;
  fields: FieldDefinition[];
  contentTypes: { name: string; displayName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FieldType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [required, setRequired] = useState(false);
  const [referenceType, setReferenceType] = useState('');
  const [itemType, setItemType] = useState('string');
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const addField = useAddField(typeName);
  const id = useId();

  const reset = () => {
    setType(null);
    setDisplayName('');
    setFieldName('');
    setNameEdited(false);
    setRequired(false);
    setReferenceType('');
    setItemType('string');
    setOptions([]);
    setRefusal(null);
  };

  const nameProblem = !fieldName
    ? 'Give the field a name.'
    : !PASCAL_CASE.test(fieldName)
      ? 'Start with a capital letter, then letters and digits only.'
      : fields.some((f) => f.name.toLowerCase() === fieldName.toLowerCase())
        ? 'This type already has a field with that name.'
        : null;
  const problem =
    (displayName.trim() === '' && 'Give the field a label.') ||
    nameProblem ||
    (type === 'reference' && !referenceType && 'Choose the type this field points at.') ||
    (type === 'choice' && hasOptionIssues(optionIssues(options)) && 'Fix the options first.') ||
    null;

  const submit = () => {
    if (!type || problem) return;
    const body: AddFieldRequest = {
      fieldName,
      displayName: displayName.trim(),
      type,
      isRequired: required,
    };
    if (type === 'reference') body.referenceType = referenceType;
    if (type === 'choice') body.options = options;
    if (type === 'array') body.itemType = itemType;
    setRefusal(null);
    addField.mutate(body, {
      onSuccess: () => {
        toast.success(`Added ${displayName.trim()}`);
        reset();
      },
      onError: (error) => setRefusal(apiErrorMessage(error, 'The field could not be added.')),
    });
  };

  return (
    <div className="mb-4">
      <Button
        type="button"
        size="sm"
        variant={open ? 'outline' : 'default'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((v) => !v);
          if (open) reset();
        }}
      >
        {open ? 'Done' : <><IconPlus />Add a field</>}
      </Button>

      {open && (
        <section id={id} aria-label="Add a field" className="mt-3 space-y-4 rounded-lg border p-4">
          <div className="flex items-baseline gap-2.5">
            <h2 className="flex-1 text-[15px] font-semibold">Add a field</h2>
            <span className="text-muted-foreground text-[12.5px]">{FIELD_TYPES.length} types</span>
          </div>

          <div className="space-y-3">
            {FIELD_TYPE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-muted-foreground mb-1.5 text-[11px] font-extrabold tracking-[0.1em] uppercase">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.types.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={type === t.value}
                      title={t.description}
                      onClick={() => setType(t.value)}
                      className={cn(
                        'focus-visible:ring-ring h-8 rounded-full border px-3 text-[12.5px] font-semibold outline-none focus-visible:ring-[3px]',
                        type === t.value ? 'bg-foreground text-background border-transparent' : 'hover:bg-secondary'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {type && (
            <form
              className="grid gap-3 border-t pt-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-label`}>Label</Label>
                <Input
                  id={`${id}-label`}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (!nameEdited) setFieldName(toFieldName(e.target.value));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`}>API name</Label>
                <Input
                  id={`${id}-name`}
                  value={fieldName}
                  className="font-mono"
                  aria-invalid={fieldName !== '' && nameProblem !== null}
                  onChange={(e) => {
                    setFieldName(e.target.value);
                    setNameEdited(true);
                  }}
                />
                {fieldName !== '' && <FieldError message={nameProblem} />}
              </div>

              {type === 'reference' && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-ref`}>Points at</Label>
                  <select
                    id={`${id}-ref`}
                    className={SELECT}
                    value={referenceType}
                    onChange={(e) => setReferenceType(e.target.value)}
                  >
                    <option value="">Choose a content type</option>
                    {contentTypes.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'array' && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-item`}>Each item is</Label>
                  <select
                    id={`${id}-item`}
                    className={SELECT}
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                  >
                    {FIELD_TYPES.filter((t) => !['array', 'object', 'choice', 'reference'].includes(t.value)).map(
                      (t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              {type === 'choice' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Options</Label>
                  <OptionsEditor options={options} onChange={setOptions} />
                </div>
              )}

              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch id={`${id}-req`} checked={required} onCheckedChange={setRequired} />
                <Label htmlFor={`${id}-req`}>Required</Label>
              </div>

              {refusal && (
                <p role="alert" className="text-destructive text-sm sm:col-span-2">
                  {refusal}
                </p>
              )}

              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={addField.isPending || problem !== null}>
                  Add field
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
