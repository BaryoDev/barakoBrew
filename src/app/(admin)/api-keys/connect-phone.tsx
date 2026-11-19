'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { useAccess } from '@/hooks/use-access';
import { isModuleEnabled, useModules } from '@/hooks/use-modules';
import {
  useApiKeys,
  usePairingSources,
  useStartPairing,
  type ApiKey,
  type PairingSource,
  type PairingStart,
} from '@/hooks/use-api-keys';
import { apiErrorMessage } from '@/lib/api';
import { countdownLabel, isSecureForPhone } from '@/lib/pairing-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * A pairing as this tab holds it. `receivedAt` is this browser's clock when the answer arrived: the
 * countdown runs from it, because the server's clock and this one need not agree.
 */
interface Pairing {
  result: PairingStart;
  name: string;
  receivedAt: number;
}

/** What the admin chose on the first step. `sources` is undefined when the server has no choice step. */
interface Choice {
  name: string;
  sources?: string[];
}

/** How long after expiry the list is still read, so a phone that redeemed at the last second is seen. */
const GRACE_MS = 5000;
const POLL_MS = 3000;

/** The module that serves the pairing routes. */
export const PAIRING_MODULE = 'ApiKeyPairing';

const pad = (n: number) => String(n).padStart(2, '0');

/** "Phone 14:05:09", local time, so each pairing makes a key name the list can be searched for. */
function pairingName(at: Date): string {
  return `Phone ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/**
 * The button on the API keys screen. Shown only when the deployment runs the pairing module and
 * the caller can create keys. A module list that cannot be read hides it.
 */
export function ConnectPhone() {
  const canCreate = useAccess().can('manage_api_keys', ['SuperAdmin', 'Admin']);
  const modules = useModules();
  const present = isModuleEnabled(modules.data, PAIRING_MODULE) === true;
  const start = useStartPairing();
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Null while the dialog is on the choice step. Kept so "New code" asks again for the same thing.
  const [choice, setChoice] = useState<Choice | null>(null);
  // Set at once on a click, so a second click before the first answer cannot make a second code.
  const inflight = useRef(false);

  if (!canCreate || !present) return null;

  function request(chosen: Choice) {
    if (inflight.current) return;
    inflight.current = true;
    setChoice(chosen);
    setFailed(null);
    setPairing(null);
    const { name } = chosen;
    start.mutate(chosen, {
      onSuccess: (result) => {
        setPairing({ result, name, receivedAt: Date.now() });
        // The result holds the code. State has it now, so the mutation drops its copy.
        start.reset();
      },
      onError: (error) => {
        const message =
          axios.isAxiosError(error) && error.response?.status === 429
            ? 'Too many codes. Wait a minute and try again.'
            : apiErrorMessage(error, 'Could not make a code.');
        setFailed(message);
        toast.error(message);
      },
      onSettled: () => {
        inflight.current = false;
      },
    });
  }

  function close() {
    setOpen(false);
    setPairing(null);
    setFailed(null);
    setChoice(null);
  }

  function back() {
    setPairing(null);
    setFailed(null);
    setChoice(null);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          back();
        }}
      >
        Connect a phone
      </Button>
      {open && (
        <ConnectPhoneDialog
          choice={choice}
          pairing={pairing}
          failed={failed}
          pending={start.isPending}
          onStart={request}
          onNewCode={() => choice && request(choice)}
          onBack={back}
          onClose={close}
        />
      )}
    </>
  );
}

/** The first step: a name for the key and one box per thing the phone may see. */
function ChoiceStep({ onStart }: { onStart: (choice: Choice) => void }) {
  const [generated] = useState(() => pairingName(new Date()));
  const [name, setName] = useState(generated);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const sources = usePairingSources();
  const list: PairingSource[] | null = sources.data ?? null;
  const isOn = (s: PairingSource) => s.allowed && (ticked[s.id] ?? s.on);

  if (sources.isPending) {
    return <p className="text-muted-foreground py-4 text-sm">Loading.</p>;
  }

  // Only a 404 means there is no choice step. Any other failure asks again, and no code is requested,
  // because a request without sources would take the server's defaults without the admin seeing them.
  if (sources.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p role="alert" className="text-destructive text-sm">
          Could not load what this phone can see.
        </p>
        <Button type="button" onClick={() => sources.refetch()} disabled={sources.isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        onStart({
          name: name.trim() || generated,
          sources: list ? list.filter(isOn).map((s) => s.id) : undefined,
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone-name">Name</Label>
        <Input id="phone-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      {list && list.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">What can this phone see?</legend>
          {list.map((s) => (
            <div key={s.id} className="flex items-start gap-2">
              <Checkbox
                id={`phone-source-${s.id}`}
                checked={isOn(s)}
                disabled={!s.allowed}
                onCheckedChange={(v) => setTicked((t) => ({ ...t, [s.id]: v === true }))}
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`phone-source-${s.id}`}>{s.label}</Label>
                {!s.allowed && <span className="text-muted-foreground text-xs">Your sign-in cannot see this.</span>}
              </div>
            </div>
          ))}
          {list.every((s) => !isOn(s)) && (
            <p className="text-muted-foreground text-xs">
              Nothing ticked. The phone will only see which modules the site runs.
            </p>
          )}
        </fieldset>
      )}
      <div className="flex justify-end">
        <Button type="submit">Show QR</Button>
      </div>
    </form>
  );
}

function ConnectPhoneDialog({
  choice,
  pairing,
  failed,
  pending,
  onStart,
  onNewCode,
  onBack,
  onClose,
}: {
  choice: Choice | null;
  pairing: Pairing | null;
  failed: string | null;
  pending: boolean;
  onStart: (choice: Choice) => void;
  onNewCode: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<{ link: string; url: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const lifeMs = pairing ? pairing.result.expiresInSeconds * 1000 : 0;
  const deadline = pairing ? pairing.receivedAt + lifeMs : NaN;
  const msLeft = deadline - now;
  const expired = !!pairing && !(msLeft > 0);
  const secure = !pairing || isSecureForPhone(pairing.result.instanceUrl);
  const link = pairing && secure ? pairing.result.link : null;

  // The server has no status route. The phone's redeem adds a key named exactly after this pairing,
  // made after the pairing was. Both times are the server's clock, so they compare with each other
  // and never with this browser's. The list is read every three seconds until five seconds after
  // expiry, so a phone that redeems in the last moment still shows.
  const name = pairing?.name;
  const madeAfter = pairing
    ? Date.parse(pairing.result.expiresAt) - pairing.result.expiresInSeconds * 1000 - GRACE_MS
    : NaN;
  const named = (keys: ApiKey[] | undefined) =>
    !!name &&
    !!keys?.some((k) => k.name === name && !k.revoked && Date.parse(k.createdAt) >= madeAfter);
  const keys = useApiKeys({
    refetchInterval: (query) =>
      pairing && !named(query.state.data) && Date.now() + POLL_MS <= deadline + GRACE_MS ? POLL_MS : false,
  });
  const connected = named(keys.data);
  const ticking = !!pairing && !connected;

  // Tick once a second while there is a code and no phone yet.
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // Draw the server's link locally. The code never goes to a QR service.
  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setQr({ link, url });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  const shown = qr && qr.link === link ? qr.url : null;
  const warning = pairing?.result.warning;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a phone</DialogTitle>
          <DialogDescription>
            Scan this code with the app. It works once and stops after two minutes. The phone gets a read-only key that
            sees only what you tick.
          </DialogDescription>
        </DialogHeader>

        {!choice ? (
          <ChoiceStep onStart={onStart} />
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 py-4 text-center">
            {!secure ? (
              <p role="alert" className="text-destructive text-sm">
                A phone can only connect over https. This address is not https.
              </p>
            ) : connected ? (
              <p role="status" className="text-lg font-semibold">
                Phone connected
              </p>
            ) : failed ? (
              <>
                <p role="alert" className="text-destructive text-sm">
                  {failed}
                </p>
                <Button onClick={onNewCode} disabled={pending}>
                  New code
                </Button>
              </>
            ) : expired ? (
              <>
                <p role="status" className="font-semibold">
                  Code expired
                </p>
                <Button onClick={onNewCode}>New code</Button>
              </>
            ) : shown ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser */}
                <img src={shown} alt="QR code to connect a phone" width={240} height={240} />
                <p className="text-muted-foreground font-mono text-xs" data-testid="pairing-countdown">
                  {countdownLabel(msLeft)}
                </p>
                {warning && <p className="text-muted-foreground text-xs">{warning}</p>}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Making a code.</p>
            )}
          </div>
        )}

        <DialogFooter>
          {choice && failed && !connected && (
            <Button type="button" variant="ghost" onClick={onBack}>
              Change choices
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {connected ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
