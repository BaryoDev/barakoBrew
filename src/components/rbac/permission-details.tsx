'use client';

import { useRef, useState } from 'react';
import type { ContentTypePermission, PermissionAction } from '@/types/rbac';
import type { ContentTypeDefinition } from '@/types/schema';
import { SensitivityLevel, sensitivityMeta } from '@/types/content';
import { CREATED_BY_FIELD } from '@/types/schema';
import {
  CONDITION_OPERATORS,
  CONDITION_RULES,
  OPERATOR_LABELS,
  conditionPreset,
  conditionProblem,
  effectiveFields,
  hasFieldSet,
  presetRow,
  readConditions,
  ruleSentence,
  toggleFieldInSet,
  transitionRule,
  withTransitionRule,
  type ConditionOperator,
  type ConditionPreset,
  type ConditionRow,
} from '@/lib/role-rules';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { IconPlus, IconTrash } from '@/components/icons';

const SELECT =
  'border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]';

export interface ConditionDraft {
  rows: ConditionRow[];
  kept: Record<string, unknown>;
}

const RULE_WORD: Record<PermissionAction, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
};

/**
 * The parts of one content type's permission the action chips do not show: conditions on Read,
 * Update and Delete, the Read and Write grid of fields, and the transitions.
 */
export function PermissionDetails({
  schema,
  permission,
  drafts,
  onDraft,
  transitionDrafts = {},
  onTransitionDraft = () => {},
  roleName = '',
  onPermission,
}: {
  schema: ContentTypeDefinition;
  permission: ContentTypePermission;
  drafts: Partial<Record<PermissionAction, ConditionDraft>>;
  onDraft: (action: PermissionAction, draft: ConditionDraft) => void;
  /** Conditions being edited on a transition's rule, by transition name. */
  transitionDrafts?: Record<string, ConditionDraft>;
  onTransitionDraft?: (transition: string, draft: ConditionDraft) => void;
  roleName?: string;
  onPermission: (permission: ContentTypePermission) => void;
}) {
  const conditionRules = CONDITION_RULES.filter((action) => permission[action].enabled);
  const showFields = permission.read.enabled || permission.create.enabled || permission.update.enabled;

  const transitions = schema.lifecycle?.transitions ?? [];

  if (conditionRules.length === 0 && !showFields && transitions.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Allow an action on {schema.displayName} first. Conditions and field limits belong to an action.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {conditionRules.map((action) => (
        <ConditionEditor
          key={action}
          id={`${schema.name}-${action}`}
          title={`${RULE_WORD[action]} only entries where`}
          draft={drafts[action] ?? readConditions(permission[action].conditions)}
          onChange={(draft) => onDraft(action, draft)}
        />
      ))}

      {showFields && <FieldGrid schema={schema} permission={permission} onPermission={onPermission} />}

      {transitions.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Transitions this role may run</p>
          {transitions.map((t) => {
            const rule = transitionRule(permission, t.name);
            const draft = transitionDrafts[t.name] ?? readConditions(rule.conditions);
            const id = `${schema.name}-transition-${t.name}`;
            return (
              <div key={t.name} className="space-y-2">
                <label htmlFor={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={id}
                    aria-label={`Run ${t.name} on ${schema.displayName}`}
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      onPermission(withTransitionRule(permission, t.name, { ...rule, enabled: checked === true }))
                    }
                  />
                  <span className="font-mono">{t.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {t.from} to {t.to}
                  </span>
                </label>
                {rule.enabled && (
                  <div className="pl-6">
                    <TransitionCondition
                      id={id}
                      name={t.name}
                      schema={schema}
                      draft={draft}
                      onChange={(next) => onTransitionDraft(t.name, next)}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      {ruleSentence(roleName, `run ${t.name} on`, schema.displayName, draft.rows)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PRESET_LABELS: Record<ConditionPreset, string> = {
  any: 'On any entry',
  own: 'Only their own',
  department: 'Only in their department',
  custom: 'Custom',
};

/** Fields every entry carries whatever its type declares. */
const SYSTEM_FIELDS = [{ name: CREATED_BY_FIELD, label: 'Created by' }];

/**
 * A transition's condition as a choice: any entry, the caller's own, the caller's department, or the
 * builder. A draft opens on the preset it is exactly, and on Custom otherwise.
 */
function TransitionCondition({
  id,
  name,
  schema,
  draft,
  onChange,
}: {
  id: string;
  name: string;
  schema: ContentTypeDefinition;
  draft: ConditionDraft;
  onChange: (draft: ConditionDraft) => void;
}) {
  const [mode, setMode] = useState<ConditionPreset>(() => conditionPreset(draft));
  const lastCustom = useRef<ConditionDraft | null>(null);
  const key = draft.rows[0]?.key ?? '';

  const choices = [
    ...SYSTEM_FIELDS.filter((s) => !schema.fields.some((f) => f.name === s.name)).map((s) => ({
      name: s.name,
      label: s.label,
    })),
    ...schema.fields.map((f) => ({ name: f.name, label: f.displayName })),
  ];
  if (key && !choices.some((c) => c.name === key)) choices.push({ name: key, label: key });

  const pick = (next: ConditionPreset) => {
    if (next === mode) return;
    if (mode === 'custom') lastCustom.current = draft;
    setMode(next);
    if (next === 'custom') {
      if (lastCustom.current) onChange(lastCustom.current);
    } else if (next === 'any') onChange({ rows: [], kept: {} });
    else if (next === 'own' || next === 'department') onChange({ rows: [presetRow(next, key)], kept: {} });
  };

  const problem = mode === 'own' || mode === 'department' ? conditionProblem(draft.rows[0] ?? presetRow(mode, '')) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Condition for ${name}`}
          className={SELECT}
          value={mode}
          onChange={(e) => pick(e.target.value as ConditionPreset)}
        >
          {(Object.keys(PRESET_LABELS) as ConditionPreset[]).map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </select>
        {(mode === 'own' || mode === 'department') && (
          <select
            aria-label={`Field for ${name}`}
            className={SELECT}
            value={key}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => onChange({ rows: [presetRow(mode, e.target.value)], kept: {} })}
          >
            <option value="">Choose a field</option>
            {choices.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {problem && <p className="text-warning text-xs">{problem}</p>}
      {mode === 'custom' && (
        <ConditionEditor id={id} title={`${name} only entries where`} draft={draft} onChange={onChange} />
      )}
    </div>
  );
}

const LEVEL_STYLE: Record<string, string> = {
  [SensitivityLevel.Public]: 'bg-muted text-muted-foreground border-transparent',
  [SensitivityLevel.Members]: 'bg-secondary text-secondary-foreground border-transparent',
  [SensitivityLevel.Sensitive]: 'text-warning border-warning',
  [SensitivityLevel.Hidden]: 'text-destructive border-destructive',
};

/** A field's sensitivity, as the content type sets it. */
function SensitivityChip({ level }: { level: string }) {
  const { label, description } = sensitivityMeta(level);
  return (
    <span
      title={description}
      className={`rounded-full border px-1.5 py-px text-[11px] font-semibold ${LEVEL_STYLE[level] ?? 'border-border text-muted-foreground'}`}
    >
      {label}
    </span>
  );
}

/**
 * One row per field with a Read box and a Write box for each of the Update and Create rules that is
 * on. Each box edits only its own rule's set (readableFields, or that rule's writableFields). Read
 * and Write are separate in the API, so neither needs the other and a click on one never changes the
 * other. A set is never left empty by a click,
 * because an empty list means no limit. Ticking every field stores an empty list, which is the same.
 */
function FieldGrid({
  schema,
  permission,
  onPermission,
}: {
  schema: ContentTypeDefinition;
  permission: ContentTypePermission;
  onPermission: (permission: ContentTypePermission) => void;
}) {
  const declared = schema.fields.map((f) => f.name);
  const writeActions = (['update', 'create'] as const).filter((a) => permission[a].enabled);
  const readOn = permission.read.enabled;
  const readSet = readOn ? effectiveFields(permission.read, 'readableFields', declared) : [];
  const writeSets = writeActions.map((a) => effectiveFields(permission[a], 'writableFields', declared));

  const stored = [
    ...(hasFieldSet(permission.read, 'readableFields') ? (permission.read.readableFields as string[]) : []),
    ...writeActions.flatMap((a) => (hasFieldSet(permission[a], 'writableFields') ? (permission[a].writableFields as string[]) : [])),
  ];
  const extras = [...new Set(stored)].filter((n) => !declared.includes(n));
  const names = [...declared, ...extras];

  const readOffId = `${schema.name}-read-off`;
  const writeOffId = `${schema.name}-write-off`;
  const noWrite = writeActions.length === 0;

  const setRead = (field: string, on: boolean) => {
    if (!readOn) return;
    onPermission({
      ...permission,
      read: { ...permission.read, readableFields: toggleFieldInSet(permission.read, 'readableFields', declared, field, on) },
    });
  };

  const setWrite = (action: 'update' | 'create', field: string, on: boolean) => {
    onPermission({
      ...permission,
      [action]: {
        ...permission[action],
        writableFields: toggleFieldInSet(permission[action], 'writableFields', declared, field, on),
      },
    });
  };

  const hintClass = 'text-muted-foreground block text-[11px] leading-tight';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Which fields</p>
        <span className="text-muted-foreground ml-auto font-mono text-xs">readable · writable</span>
      </div>
      <table className="w-full max-w-2xl overflow-hidden rounded-lg border text-sm">
        <thead>
          <tr className="bg-muted text-muted-foreground text-xs">
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Field
            </th>
            <th scope="col" className="w-28 px-3 py-2 text-center font-semibold">
              Read
            </th>
            {noWrite ? (
              <th scope="col" className="w-28 px-3 py-2 text-center font-semibold">
                Write
              </th>
            ) : (
              writeActions.map((action) => (
                <th key={action} scope="col" className="w-28 px-3 py-2 text-center font-semibold">
                  {writeActions.length > 1 ? `Write (${RULE_WORD[action]})` : 'Write'}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {names.map((fieldName) => {
            const field = schema.fields.find((f) => f.name === fieldName);
            const label = field?.displayName ?? fieldName;
            const readTicked = readSet.includes(fieldName);
            const lastRead = readTicked && readSet.length === 1;
            const readHint = lastRead ? 'At least one field. Turn off Read to allow none.' : null;
            const readHintId = `${schema.name}-read-${fieldName}-hint`;
            return (
              <tr key={fieldName} className="border-t">
                <td className="px-3 py-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span>{label}</span>
                    {field?.sensitivity && <SensitivityChip level={field.sensitivity} />}
                    {!field && <span className="text-warning text-xs">not a field of this type</span>}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <Checkbox
                    aria-label={`Read ${label}`}
                    checked={readTicked}
                    disabled={!readOn || lastRead}
                    aria-describedby={!readOn ? readOffId : readHint ? readHintId : undefined}
                    onCheckedChange={(checked) => setRead(fieldName, checked === true)}
                  />
                  {readHint && (
                    <span id={readHintId} className={hintClass}>
                      {readHint}
                    </span>
                  )}
                </td>
                {noWrite ? (
                  <td className="px-3 py-1.5 text-center">
                    <Checkbox aria-label={`Write ${label}`} checked={false} disabled aria-describedby={writeOffId} />
                  </td>
                ) : (
                  writeActions.map((action, i) => {
                    const held = writeSets[i];
                    const ticked = held.includes(fieldName);
                    const last = ticked && held.length === 1;
                    const hint = last ? `At least one field. Turn off ${RULE_WORD[action]} to allow none.` : null;
                    const hintId = `${schema.name}-write-${action}-${fieldName}-hint`;
                    return (
                      <td key={action} className="px-3 py-1.5 text-center">
                        <Checkbox
                          aria-label={writeActions.length > 1 ? `Write ${label} (${RULE_WORD[action]})` : `Write ${label}`}
                          checked={ticked}
                          disabled={last}
                          aria-describedby={hint ? hintId : undefined}
                          onCheckedChange={(checked) => setWrite(action, fieldName, checked === true)}
                        />
                        {hint && (
                          <span id={hintId} className={hintClass}>
                            {hint}
                          </span>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOn && (
        <p id={readOffId} className="text-muted-foreground text-xs">
          Read is off. Turn on Read to choose which fields it shows.
        </p>
      )}
      {noWrite && (
        <p id={writeOffId} className="text-muted-foreground text-xs">
          Update and Create are off. Turn on Update or Create to choose which fields they set.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Sensitivity is the default a reader gets with no rule. Ticking every field removes the limit. To allow none,
        turn the action off. Sensitive fields stay masked for a role that cannot read them.
      </p>
    </div>
  );
}

function ConditionEditor({
  id,
  title,
  draft,
  onChange,
}: {
  id: string;
  title: string;
  draft: ConditionDraft;
  onChange: (draft: ConditionDraft) => void;
}) {
  const kept = Object.keys(draft.kept).length;
  const update = (index: number, row: ConditionRow) =>
    onChange({ ...draft, rows: draft.rows.map((r, i) => (i === index ? row : r)) });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {draft.rows.length === 0 && kept === 0 && (
        <p className="text-muted-foreground text-xs">No condition: every entry the action reaches.</p>
      )}
      {draft.rows.map((row, index) => {
        const problem = conditionProblem(row);
        const rowId = `${id}-condition-${index}`;
        return (
          <div key={index} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Condition ${index + 1} field`}
                value={row.key}
                placeholder="Class.InstructorUser"
                className="w-56 font-mono text-xs"
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${rowId}-problem` : undefined}
                onChange={(e) => update(index, { ...row, key: e.target.value })}
              />
              <select
                aria-label={`Condition ${index + 1} operator`}
                className={SELECT}
                value={row.operator}
                onChange={(e) => update(index, { ...row, operator: e.target.value as ConditionOperator })}
              >
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_LABELS[op]}
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Condition ${index + 1} value`}
                value={row.value}
                placeholder={row.operator === '_in' || row.operator === '_nin' ? 'a, b, c' : '$CURRENT_USER'}
                className="w-48 font-mono text-xs"
                onChange={(e) => update(index, { ...row, value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove condition ${index + 1}`}
                onClick={() => onChange({ ...draft, rows: draft.rows.filter((_, i) => i !== index) })}
              >
                <IconTrash />
              </Button>
            </div>
            {problem && (
              <p id={`${rowId}-problem`} className="text-warning text-xs">
                {problem}
              </p>
            )}
          </div>
        );
      })}
      {kept > 0 && (
        <p className="text-muted-foreground text-xs">
          {kept} more {kept === 1 ? 'condition' : 'conditions'} this screen cannot show, kept as stored.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...draft, rows: [...draft.rows, { key: '', operator: '_eq', value: '' }] })}
      >
        <IconPlus />
        Add condition
      </Button>
      <p className="text-muted-foreground text-xs">
        A field written Reference.Field follows the entry&apos;s reference and compares a Public field of the
        entry it points at, for example Class.InstructorUser is $CURRENT_USER.
      </p>
    </div>
  );
}
