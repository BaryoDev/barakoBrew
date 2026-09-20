'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconCopy } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * The one place a secret the API returns once is put on screen.
 *
 * It holds no state of its own. The secret lives in the caller's `useState` and nowhere else, so
 * unmounting the screen or calling `onDismiss` is the whole of what removes it. Any mutation that
 * produced it carries `SECRET_MUTATION` from `@/lib/secrets`, which keeps it out of the caches that
 * would otherwise outlive this component.
 */
interface RevealOnceProps {
  title: string;
  description?: React.ReactNode;
  /** One string renders as a field, several render as a list. */
  secret: string | string[];
  /** Accessible name of the field or list. */
  secretLabel: string;
  /** Replaces the default "only time it is shown" line. */
  warning?: React.ReactNode;
  copyLabel?: string;
  copiedMessage?: string;
  /** Omit both and no dismiss button is rendered, for a flow whose own buttons end it. */
  dismissLabel?: string;
  onDismiss?: () => void;
  /** Sits beside the secret, for the MFA QR code. */
  aside?: React.ReactNode;
  /** Extra notes under the warning. */
  children?: React.ReactNode;
  testId?: string;
  /** `DialogTitle` and `DialogDescription` when this is inside a dialog, so Radix names it. */
  titleAs?: React.ElementType;
  descriptionAs?: React.ElementType;
  className?: string;
}

const ONE = 'This is the only time it is shown. Copy it now, it cannot be shown again.';
const MANY = 'This is the only time they are shown. Copy them now, they cannot be shown again.';

export function RevealOnce({
  title,
  description,
  secret,
  secretLabel,
  warning,
  copyLabel = 'Copy',
  copiedMessage = 'Copied',
  dismissLabel,
  onDismiss,
  aside,
  children,
  testId,
  titleAs: Title = 'p',
  descriptionAs: Description = 'p',
  className,
}: RevealOnceProps) {
  const many = Array.isArray(secret);
  const text = many ? secret.join('\n') : secret;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copiedMessage);
    } catch {
      toast.error('It could not be copied. Select it and copy it by hand.');
    }
  }

  const copyButton = (
    <Button type="button" variant="outline" onClick={copy}>
      <IconCopy />
      {copyLabel}
    </Button>
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <Title className="text-sm font-semibold">{title}</Title>
        {description && <Description className="text-muted-foreground text-sm">{description}</Description>}
      </div>

      <div className={cn('gap-4', aside ? 'flex flex-col sm:flex-row sm:items-start' : undefined)}>
        {aside}
        <div className="min-w-0 flex-1 space-y-3">
          {many ? (
            <>
              <ul
                aria-label={secretLabel}
                data-testid={testId}
                className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm"
              >
                {secret.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div>{copyButton}</div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                aria-label={secretLabel}
                value={secret}
                data-testid={testId}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              {copyButton}
            </div>
          )}

          <p className="text-warning text-xs font-semibold">{warning ?? (many ? MANY : ONE)}</p>
          {children}
        </div>
      </div>

      {dismissLabel && onDismiss && (
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          {dismissLabel}
        </Button>
      )}
    </div>
  );
}
