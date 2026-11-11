'use client';

import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useSetFieldSensitivity } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { getContractServerState, getContractState, subscribeToContract } from '@/lib/api-contract';
import { sensitivityChoices, sensitivityMeta } from '@/types/content';
import { SensitivityLevel, type FieldDefinition } from '@/types/schema';
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
 * A field's sensitivity as a chip that changes it. Each press moves to the next level and calls
 * PUT .../fields/{field}/sensitivity. Moving to a more widely read level is a disclosure of what is
 * already stored, so it is confirmed first and sent with `acknowledgeDisclosure`.
 */
export function FieldSensitivityChip({ typeName, field }: { typeName: string; field: FieldDefinition }) {
  const contract = useSyncExternalStore(subscribeToContract, getContractState, getContractServerState);
  const setSensitivity = useSetFieldSensitivity(typeName);
  const [confirming, setConfirming] = useState<SensitivityLevel | null>(null);

  const current = field.sensitivity ?? SensitivityLevel.Public;
  const offered = sensitivityChoices(contract, BY_EXPOSURE, current);
  const target = nextSensitivity(current, offered);
  const label = sensitivityMeta(current).label;

  const send = (to: SensitivityLevel, acknowledgeDisclosure: boolean) =>
    setSensitivity.mutate(
      { field: field.name, sensitivity: to, acknowledgeDisclosure },
      {
        onSuccess: () => toast.success(`${field.displayName} is now ${sensitivityMeta(to).label}`),
        onError: (error) => toast.error(apiErrorMessage(error, 'Could not change the sensitivity.')),
      }
    );

  const press = () => {
    if (target === current) return;
    if (isLowering(current, target)) setConfirming(target);
    else send(target, false);
  };

  return (
    <>
      <button
        type="button"
        disabled={setSensitivity.isPending}
        onClick={press}
        title={`Change to ${sensitivityMeta(target).label}`}
        aria-label={`${field.displayName} sensitivity: ${label}. Change to ${sensitivityMeta(target).label}`}
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
