'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { installLine } from '@/lib/module-state';
import type { ModuleSummary } from '@/types/modules';

/**
 * Copies `dotnet add package <id>`. Renders nothing for a module whose package is not known. It
 * copies a line and nothing else: the console cannot add a package to a running deployment.
 */
export function CopyInstallLine({ module }: { module: Pick<ModuleSummary, 'package'> }) {
    const [copied, setCopied] = useState(false);
    const line = installLine(module);
    if (!line) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(line);
                    setCopied(true);
                    toast.success(`Copied: ${line}. Restart the API, then enable it for the tenant.`);
                } catch {
                    setCopied(false);
                    toast.error('Could not copy. Select the line and copy it by hand.');
                }
            }}
        >
            {copied ? 'Copied' : 'Copy install'}
        </Button>
    );
}
