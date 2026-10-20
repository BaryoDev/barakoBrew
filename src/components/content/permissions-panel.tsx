'use client';

import { SensitivityLevel } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

/** Read only: who sees each field is edited on the content type, not on an entry. */
export function PermissionsPanel({ fields }: { fields: FieldDefinition[] }) {
  if (fields.length === 0) {
    return <p className="text-muted-foreground text-sm">This type has no fields.</p>;
  }
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-muted-foreground text-sm">
        Field sensitivity as the content type sets it. It is edited on the content type, not here.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left font-mono text-xs">
            <th className="py-1 pr-4 font-normal">Field</th>
            <th className="py-1 pr-4 font-normal">Sensitivity</th>
            <th className="py-1 pr-4 font-normal">Visible to roles</th>
            <th className="py-1 font-normal">Mask</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const level = f.sensitivity ?? SensitivityLevel.Public;
            const roles = f.visibleToRoles ?? [];
            return (
              <tr key={f.name} className="border-t">
                <td className="py-2 pr-4 font-medium">{f.displayName}</td>
                <td className="py-2 pr-4 font-mono text-xs">{level}</td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {level === SensitivityLevel.Public
                    ? 'everyone'
                    : roles.length > 0
                      ? roles.join(', ')
                      : 'by capability'}
                </td>
                <td className="py-2 font-mono text-xs">
                  {level === SensitivityLevel.Public ? 'none' : (f.mask ?? 'Default')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
