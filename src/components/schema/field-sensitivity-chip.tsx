'use client';

import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useSetFieldSensitivity } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { getContractServerState, getContractState, subscribeToContract } from '@/lib/api-contract';
import { sensitivityChoices, sensitivityMeta } from '@/types/content';
import { resolveFieldType, SensitivityLevel, type ContentTypeDefinition, type FieldDefinition } from '@/types/schema';
import { FieldMask } from '@/types/schema';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';

/** From the most widely read to the least. Public is first, so one more step is one more restriction. */
const BY_EXPOSURE = [
  SensitivityLevel.Public,
  SensitivityLevel.Members,
  SensitivityLevel.Sensitive,
  SensitivityLevel.Hidden,
];

const TONES: Record<string, Tone> = {
  [SensitivityLevel.Public]: 'success',
  [SensitivityLevel.Members]: 'accent',
};

/**
 * What a press of the chip moves a field to: the next more restricted level, and from the most
 * restricted back to Public. Members is skipped against an API that does not know it. Public is
 * never skipped, so a field that is not Public can always get back.
 */
export function nextSensitivity(
  current: SensitivityLevel,
  offered: readonly SensitivityLevel[]
): SensitivityLevel {
  const levels = BY_EXPOSURE.filter((level) => offered.includes(level));
  const at = levels.indexOf(current);
  return levels[(at + 1) % levels.length] ?? SensitivityLevel.Public;
}

/** Whether going from one level to another lets more callers read what is already stored. */
export function isLowering(from: SensitivityLevel, to: SensitivityLevel): boolean {
  return BY_EXPOSURE.indexOf(to) < BY_EXPOSURE.indexOf(from);
}

/**
 * The levels the API would refuse for this field, so the chip never walks into one. Mirrors
 * SetFieldSensitivity: a type whose stream is its source of truth keeps every field Public, a field
 * a uniqueness rule names stays Public, and a token cannot be Members.
 */
export function refusedLevels(
  schema: Pick<ContentTypeDefinition, 'eventSourced' | 'uniqueness'>,
  field: FieldDefinition
): { levels: Set<SensitivityLevel>; reason: string | null } {
  const levels = new Set<SensitivityLevel>();
  let reason: string | null = null;
  if (schema.eventSourced) {
    BY_EXPOSURE.filter((l) => l !== SensitivityLevel.Public).forEach((l) => levels.add(l));
    reason = 'This type is event sourced, so its fields have to stay Public.';
  } else if (
    (schema.uniqueness ?? []).some((rule) =>
      rule.fields.some((f) => f.toLowerCase() === field.name.toLowerCase())
    )
  ) {
    BY_EXPOSURE.filter((l) => l !== SensitivityLevel.Public).forEach((l) => levels.add(l));
    reason = 'A uniqueness rule compares this field, so it has to stay Public.';
  } else if (resolveFieldType(field.type) === 'token') {
    levels.add(SensitivityLevel.Members);
  }
  return { levels, reason };
}

/** Public and Members read alike for everyone they apply to, so they carry no roles and no mask. */
const isUniform = (level: SensitivityLevel) =>
  level === SensitivityLevel.Public || level === SensitivityLevel.Members;

/**
 * A field's sensitivity as a chip that changes it. Each press moves to the next level and calls
 * PUT .../fields/{field}/sensitivity. Moving to a more widely read level is a disclosure of what is
 * already stored, so it is confirmed first and sent with `acknowledgeDisclosure`.
 */
export function FieldSensitivityChip({
  schema,
  field,
}: {
  schema: Pick<ContentTypeDefinition, 'name' | 'eventSourced' | 'uniqueness'>;
  field: FieldDefinition;
}) {
  const typeName = schema.name;
  const contract = useSyncExternalStore(subscribeToContract, getContractState, getContractServerState);
  const setSensitivity = useSetFieldSensitivity(typeName);
  const [confirming, setConfirming] = useState<SensitivityLevel | null>(null);

  const current = field.sensitivity ?? SensitivityLevel.Public;
  const refused = refusedLevels(schema, field);
  // What the contract offers and the type can take. The current level stays, so the chip can show it.
  const offered = sensitivityChoices(contract, BY_EXPOSURE, current).filter(
    (level) => level === current || !refused.levels.has(level)
  );
  const target = nextSensitivity(current, offered);
  const label = sensitivityMeta(current).label;

  const send = (to: SensitivityLevel, acknowledgeDisclosure: boolean) =>
    setSensitivity.mutate(
      {
        field: field.name,
        sensitivity: to,
        acknowledgeDisclosure,
        // The API replaces the role list and the mask with what it is sent, so a field that has
        // them keeps them by sending them back. Public and Members refuse both, so they go empty.
        visibleToRoles: isUniform(to) ? [] : (field.visibleToRoles ?? []),
        mask: isUniform(to) || !field.mask || field.mask === FieldMask.Default ? undefined : field.mask,
      },
      {
        onSuccess: (result) => {
          const applying = result?.change?.status && result.change.status.toLowerCase() !== 'completed';
          const label = sensitivityMeta(to).label;
          toast.success(
            applying
              ? `${field.displayName} is changing to ${label}. It is applying to existing entries.`
              : `${field.displayName} is now ${label}`
          );
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Could not change the sensitivity.')),
      }
    );

  const pinned = target === current;

  const press = () => {
    if (pinned) return;
    if (isLowering(current, target)) setConfirming(target);
    else send(target, false);
  };

  return (
    <>
      <button
        type="button"
        disabled={setSensitivity.isPending || pinned}
        onClick={press}
        title={pinned ? (refused.reason ?? 'No other level is available') : `Change to ${sensitivityMeta(target).label}`}
        aria-label={
          pinned
            ? `${field.displayName} sensitivity: ${label}. ${refused.reason ?? 'No other level is available.'}`
            : `${field.displayName} sensitivity: ${label}. Change to ${sensitivityMeta(target).label}`
        }
        className="focus-visible:ring-ring cursor-pointer rounded-full outline-none focus-visible:ring-[3px] disabled:opacity-60"
      >
        <StatusBadge tone={TONES[current] ?? 'warning'} dot={false}>
          {label}
        </StatusBadge>
      </button>
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          title={`Make ${field.displayName} ${sensitivityMeta(confirming).label}?`}
          description={`Values already written become readable to everyone who can read this type, and anonymously if the type is served publicly. The API counts the entries affected.`}
          confirmLabel={`Make ${sensitivityMeta(confirming).label}`}
          destructive
          onConfirm={() => {
            send(confirming, true);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}
