'use client';

import type { ContentTypePermission, PermissionAction } from '@/types/rbac';
import type { ContentTypeDefinition } from '@/types/schema';
import {
  CONDITION_OPERATORS,
  CONDITION_RULES,
  FIELD_SET_RULES,
  OPERATOR_LABELS,
  conditionProblem,
  hasFieldSet,
  readConditions,
  type ConditionOperator,
  type ConditionRow,
} from '@/lib/role-rules';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
 * The parts of one content type's permission the grid does not show: conditions on Read, Update and
 * Delete, and the field sets on Read, Create and Update.
 */
export function PermissionDetails({
  schema,
  permission,
  drafts,
  onDraft,
  onPermission,
}: {
  schema: ContentTypeDefinition;
  permission: ContentTypePermission;
  drafts: Partial<Record<PermissionAction, ConditionDraft>>;
  onDraft: (action: PermissionAction, draft: ConditionDraft) => void;
  onPermission: (permission: ContentTypePermission) => void;
}) {
  const conditionRules = CONDITION_RULES.filter((action) => permission[action].enabled);
  const setRules = FIELD_SET_RULES.filter(({ action }) => permission[action].enabled);

  if (conditionRules.length === 0 && setRules.length === 0) {
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

      {setRules.map(({ action, set }) => {
        const rule = permission[action];
        const limited = hasFieldSet(rule, set);
        const chosen = limited ? (rule[set] as string[]) : [];
        const names = [...schema.fields.map((f) => f.name), ...chosen.filter((n) => !schema.fields.some((f) => f.name === n))];
        const verb = set === 'readableFields' ? 'shows' : 'sets';
        const switchId = `${schema.name}-${action}-${set}`;

        const write = (next: string[]) =>
          onPermission({ ...permission, [action]: { ...rule, [set]: next } });

        return (
          <div key={`${action}-${set}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id={switchId}
                checked={limited}
                onCheckedChange={(on) => write(on ? schema.fields.map((f) => f.name) : [])}
              />
              <label htmlFor={switchId} className="text-sm font-medium">
                {RULE_WORD[action]} {verb} only some fields
              </label>
            </div>
            {limited && (
              <div className="grid grid-cols-1 gap-1.5 pl-10 sm:grid-cols-2">
                {names.map((fieldName) => {
                  const declared = schema.fields.find((f) => f.name === fieldName);
                  return (
                    <label key={fieldName} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={chosen.includes(fieldName)}
                        onCheckedChange={(checked) =>
                          write(
                            checked === true
                              ? [...chosen, fieldName]
                              : chosen.filter((n) => n !== fieldName),
                          )
                        }
                      />
                      <span>{declared?.displayName ?? fieldName}</span>
                      {!declared && <span className="text-warning text-xs">not a field of this type</span>}
                    </label>
                  );
                })}
                <p className="text-muted-foreground col-span-full text-xs">
                  Unticking every field removes the limit. Sensitive fields stay masked for a role that cannot
                  read them.
                </p>
              </div>
            )}
          </div>
        );
      })}
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
