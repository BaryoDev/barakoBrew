'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_ROTATE_OVERLAP_INDEX,
  ROTATE_OVERLAPS,
  useRevokeApiKey,
  useRotateApiKey,
  type ApiKey,
  type CreatedApiKey,
} from '@/hooks/use-api-keys';
import { apiErrorMessage } from '@/lib/api';
import { RevealOnce } from '@/components/patterns/reveal-once';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/** When the old key stops: the end of the overlap, or its own expiry if that comes first. */
function stopTime(old: ApiKey, overlapMinutes: number, now: number): string {
  const cutoff = now + overlapMinutes * 60_000;
  const own = old.expiresAt ? new Date(old.expiresAt).getTime() : Infinity;
  return new Date(Math.min(cutoff, own)).toISOString();
}

function RotateForm({
  apiKey,
  onClose,
  onRotated,
  onStopped,
}: {
  apiKey: ApiKey;
  onClose: () => void;
  /** The old key's id and the time it stops, once the new key exists. */
  onRotated: (id: string, stopsAt: string) => void;
  onStopped: (id: string) => void;
}) {
  const rotate = useRotateApiKey();
  const revoke = useRevokeApiKey();
  const [stop, setStop] = useState(DEFAULT_ROTATE_OVERLAP_INDEX);
  // The new secret lives here and nowhere else. Closing the rail unmounts this form.
  const [issued, setIssued] = useState<{ key: CreatedApiKey; stopsAt: string; immediate: boolean } | null>(null);
  const [stopped, setStopped] = useState(false);
  const overlap = ROTATE_OVERLAPS[stop];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rotate.isPending) return;
    try {
      const key = await rotate.mutateAsync({ id: apiKey.id, overlapMinutes: overlap.minutes });
      const stopsAt = stopTime(apiKey, overlap.minutes, Date.now());
      setIssued({ key, stopsAt, immediate: overlap.minutes === 0 });
      rotate.reset(); // the result carries the key, so drop it from the mutation cache now
      onRotated(apiKey.id, stopsAt);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not rotate the key.'));
    }
  }

  async function stopNow() {
    try {
      await revoke.mutateAsync(apiKey.id);
      setStopped(true);
      onStopped(apiKey.id);
      toast.success(`Stopped "${apiKey.name}"`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not stop the old key.'));
    }
  }

  if (issued) {
    return (
      <div className="space-y-4 p-4">
        <RevealOnce
          title="Copy your new API key"
          titleAs={SheetTitle}
          description={`It replaces "${apiKey.name}".`}
          descriptionAs={SheetDescription}
          secret={issued.key.key}
          secretLabel="New API key"
          testId="rotated-key-secret"
          dismissLabel="Done"
          onDismiss={onClose}
        />
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          {stopped || issued.immediate ? (
            <p>The old key has stopped.</p>
          ) : (
            <>
              <p>
                The old key stops working at{' '}
                <time dateTime={issued.stopsAt}>{new Date(issued.stopsAt).toLocaleString()}</time>.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={stopNow} disabled={revoke.isPending}>
                Stop the old key now
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Rotate {apiKey.name}</SheetTitle>
        <SheetDescription>
          Issues a new key. Update the callers that use the old one before it stops.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-4">
        <div className="space-y-2">
          <Label htmlFor="rotate-overlap">Overlap: {overlap.label}</Label>
          <input
            id="rotate-overlap"
            type="range"
            min={0}
            max={ROTATE_OVERLAPS.length - 1}
            step={1}
            value={stop}
            onChange={(e) => setStop(Number(e.target.value))}
            aria-label="Overlap"
            aria-valuetext={overlap.label}
            className="w-full"
          />
          <div className="text-muted-foreground flex justify-between text-xs" aria-hidden="true">
            <span>None</span>
            <span>7 days</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {overlap.minutes === 0
              ? 'The old key stops the moment the new one is issued.'
              : 'The old key keeps working for this long, so callers can switch without a gap.'}{' '}
            {overlap.minutes === 60 && 'Sixty minutes is the default.'}
          </p>
        </div>

        <div className="space-y-1 text-sm">
          <p className="font-medium">What stays the same</p>
          <p className="text-muted-foreground text-xs">
            The new key has the same name, owner, tenant, scopes and content types.
          </p>
          <p className="text-muted-foreground text-xs">
            Full content access (<code className="font-mono">*</code>) does not include{' '}
            <code className="font-mono">files:read</code> or <code className="font-mono">files:write</code>.
          </p>
        </div>
      </div>

      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={rotate.isPending}>
          {rotate.isPending ? 'Rotating' : 'Rotate key'}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function RotateRail({
  apiKey,
  onClose,
  onRotated,
  onStopped,
}: {
  apiKey: ApiKey | null;
  onClose: () => void;
  onRotated: (id: string, stopsAt: string) => void;
  onStopped: (id: string) => void;
}) {
  return (
    <Sheet open={apiKey !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] sm:max-w-[440px]">
        {apiKey && (
          <RotateForm key={apiKey.id} apiKey={apiKey} onClose={onClose} onRotated={onRotated} onStopped={onStopped} />
        )}
      </SheetContent>
    </Sheet>
  );
}
