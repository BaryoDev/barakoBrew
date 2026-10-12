'use client';

import { Button } from '@/components/ui/button';
import { IconRefresh, IconWarning } from '@/components/icons';
import { isResponseShapeError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  /** What failed to load, e.g. "groups". Used in the default message. */
  entity: string;
  /** Retry handler — pass the query's `refetch`. */
  onRetry?: () => void;
  className?: string;
  /** The query's error. A response in the wrong shape gets its own words, since retrying will not fix it. */
  error?: unknown;
}

/**
 * Shown when a list query fails.
 *
 * Distinct from EmptyState on purpose: rendering "No groups yet" after a failed
 * request tells the user their data is gone when it is only unreachable.
 */
export function ErrorState({ entity, onRetry, className, error }: ErrorStateProps) {
  const wrongShape = isResponseShapeError(error);
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center',
        className
      )}
    >
      <div className="bg-destructive/10 text-destructive mb-4 flex size-11 items-center justify-center rounded-lg">
        <IconWarning className="size-5" />
      </div>
      <h3 className="text-sm font-medium">Couldn&apos;t load {entity}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        {wrongShape
          ? 'The API answered in a shape this console does not read, so nothing is shown rather than a list that may be wrong. The console and the API are probably on versions that do not match.'
          : 'The request failed, so this list is incomplete. It does not mean the data is gone. Check your connection and try again.'}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <IconRefresh className="size-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}
