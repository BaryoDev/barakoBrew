'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAccess } from '@/hooks/use-access';
import { useCurrentTenant, useMyTenants } from '@/hooks/use-tenants';
import { usePairingStatus, useStartPairing, type PairingStart } from '@/hooks/use-api-keys';
import { apiErrorMessage, getApiUrl } from '@/lib/api';
import { buildPairingLink, countdownLabel, isSecureForPhone } from '@/lib/pairing-link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** The button on the API keys screen. Shown only to a caller who can create keys. */
export function ConnectPhone() {
  const canCreate = useAccess().can('manage_api_keys', ['SuperAdmin', 'Admin']);
  const start = useStartPairing();
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<PairingStart | null>(null);
  const [failed, setFailed] = useState(false);
  // Set at once on a click, so a second click before the first answer cannot make a second code.
  const inflight = useRef(false);
  const secure = isSecureForPhone(getApiUrl());

  if (!canCreate) return null;

  function request() {
    if (!secure || inflight.current) return;
    inflight.current = true;
    setFailed(false);
    setPairing(null);
    start.mutate('Phone', {
      onSuccess: (result) => {
        setPairing(result);
        // The result holds the code. State has it now, so the mutation drops its copy.
        start.reset();
      },
      onError: (error) => {
        setFailed(true);
        toast.error(apiErrorMessage(error, 'Could not make a code.'));
      },
      onSettled: () => {
        inflight.current = false;
      },
    });
  }

  function close() {
    setOpen(false);
    setPairing(null);
    setFailed(false);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          request();
        }}
      >
        Connect a phone
      </Button>
      {open && (
        <ConnectPhoneDialog
          pairing={pairing}
          failed={failed}
          secure={secure}
          pending={start.isPending}
          onNewCode={request}
          onClose={close}
        />
      )}
    </>
  );
}

function ConnectPhoneDialog({
  pairing,
  failed,
  secure,
  pending,
  onNewCode,
  onClose,
}: {
  pairing: PairingStart | null;
  failed: boolean;
  secure: boolean;
  pending: boolean;
  onNewCode: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const tenant = useCurrentTenant();
  const tenants = useMyTenants();
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const slug = tenant ?? 'default';
  const instanceName =
    tenants.data?.find((t) => t.slug === slug)?.name ||
    (typeof window !== 'undefined' ? window.location.hostname : '') ||
    slug;

  const expiresMs = pairing ? Date.parse(pairing.expiresAt) : NaN;
  const msLeft = expiresMs - now;
  const expired = !!pairing && !(msLeft > 0);

  const status = usePairingStatus(pairing?.id ?? null, !!pairing && !expired);
  const connected = !!status.data?.redeemedAt;
  const ticking = !!pairing && !connected;

  // Tick once a second while there is a code and no phone yet.
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // Render the link locally. The code never goes to a QR service.
  const link = useMemo(
    () =>
      pairing && secure
        ? buildPairingLink({
            url: getApiUrl(),
            tenant: slug,
            name: instanceName,
            code: pairing.code,
            expiresAt: pairing.expiresAt,
          })
        : null,
    [pairing, secure, slug, instanceName],
  );
  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  // The phone redeemed: the new key is in the list now.
  useEffect(() => {
    if (connected) void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
  }, [connected, queryClient]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a phone</DialogTitle>
          <DialogDescription>
            Scan this code with the app. It works once and stops after five minutes. The phone gets a read-only key.
          </DialogDescription>
        </DialogHeader>

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
            <p role="alert" className="text-destructive text-sm">
              Could not make a code.
            </p>
          ) : expired ? (
            <>
              <p role="status" className="font-semibold">
                Code expired
              </p>
              <Button onClick={onNewCode}>New code</Button>
            </>
          ) : qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser */}
              <img src={qr} alt="QR code to connect a phone" width={240} height={240} />
              <p className="text-muted-foreground font-mono text-xs" data-testid="pairing-countdown">
                {countdownLabel(msLeft)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Making a code.</p>
          )}
          {failed && !pairing && (
            <Button onClick={onNewCode} disabled={pending}>
              New code
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {connected ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
