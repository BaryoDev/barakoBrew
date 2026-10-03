'use client';

import { Button } from '@/components/ui/button';

/**
 * Whether a refused save may go through if sent again unchanged.
 *
 * The API says so in words and nowhere else: a uniqueness check that waited too long for another
 * write of the same values answers 409 with "Try again shortly", and every other 409 from a write
 * means another entry holds the values, which sending again does not change.
 */
export function isRetryableRefusal(message: string): boolean {
    return /try again shortly/i.test(message);
}

/** The API's reason for refusing a save, kept on the page, with a retry when one can help. */
export function SaveRefusal({
    message,
    onRetry,
    retrying,
}: {
    message: string;
    onRetry?: () => void;
    retrying?: boolean;
}) {
    return (
        <div role="alert" className="text-destructive mt-3 flex flex-wrap items-center gap-3 text-sm">
            <p>{message}</p>
            {onRetry && (
                <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
                    Try again
                </Button>
            )}
        </div>
    );
}
