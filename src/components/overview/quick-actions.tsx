'use client';

import type { ComponentType, SVGProps } from 'react';
import Link from 'next/link';
import { IconArchive, IconPlay, IconPlus, IconSettings } from '@/components/icons';
import { useModuleEnabled } from '@/hooks/use-modules';
import { MODULE } from '@/types/modules';

interface Action {
  title: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Links to the screens that do the work. The API still checks the role on arrival. */
export function QuickActions() {
  // Only a deployment that says it does not run Files loses the upload link.
  const files = useModuleEnabled(MODULE.files);
  const actions: Action[] = [
    { title: 'New entry', href: '/content/new', icon: IconPlus },
    { title: 'Fire a workflow', href: '/workflows', icon: IconPlay },
    ...(files === false ? [] : [{ title: 'Upload a file', href: '/files', icon: IconArchive }]),
    { title: 'Site settings', href: '/settings', icon: IconSettings },
  ];

  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick actions" role="group">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="border-border bg-card hover:border-primary flex h-10 items-center gap-2 rounded-full border pr-3.5 pl-2.5 text-[13.5px] font-semibold hover-button rise outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="hover-icon bg-accent text-accent-foreground grid size-6 place-items-center rounded-full">
            <a.icon className="size-3.5" aria-hidden />
          </span>
          {a.title}
        </Link>
      ))}
    </div>
  );
}
