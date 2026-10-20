'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { installLine } from '@/lib/module-state';
import type { ModuleSummary } from '@/types/modules';

/** Copies `dotnet add package <id>`. Renders nothing for a module whose package is not known. */
export function CopyInstallLine({ module }: { module: ModuleSummary }) {
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
                } catch {
                    setCopied(false);
                }
            }}
        >
            {copied ? 'Copied' : 'Copy install line'}
        </Button>
    );
}
