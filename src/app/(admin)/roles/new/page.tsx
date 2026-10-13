'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateRole, useRoles } from '@/hooks/use-rbac';
import { useAccess } from '@/hooks/use-access';
import { reportsRoleOwners } from '@/types/rbac';
import { apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { RoleEditor } from '@/components/rbac/role-editor';

export default function NewRolePage() {
  const router = useRouter();
  const createRole = useCreateRole();
  const canManagePlatformRoles = useAccess().can('manage_platform_roles', ['SuperAdmin']);
  const { data: roles } = useRoles();

  return (
    <>
      <PageHeader
        title="New role"
        description="Grant per-content-type permissions, then assign the role to users."
      />
      <RoleEditor
        submitLabel="Create role"
        canAddPlatformCapabilities={canManagePlatformRoles || !reportsRoleOwners(roles?.items)}
        isPending={createRole.isPending}
        onCancel={() => router.push('/roles')}
        onSubmit={(role) =>
          createRole.mutate(role, {
            onSuccess: () => {
              toast.success(`Role “${role.name}” created`);
              router.push('/roles');
            },
            onError: (error) => toast.error(apiErrorMessage(error, 'The role could not be created.')),
          })
        }
      />
    </>
  );
}
