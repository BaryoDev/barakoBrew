import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

// Mirrors the BarakoCMS.Pwa module responses (camelCase over the wire).

export type DisplayMode = 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser';
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other';

export interface InstallDto {
  userId: string | null;
  username: string | null;
  tenant: string | null;
  platform: Platform | null;
  displayMode: DisplayMode;
  installed: boolean;
  userAgent: string | null;
  launchCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  installedAt: string | null;
}

/** The largest page the API serves; installs are newest first, so this is the latest 100. */
export const INSTALLS_PAGE_SIZE = 100;

export interface PwaInstalls {
  devices: InstallDto[];
  /** Every device the API knows about, which can be more than the page holds. */
  totalDevices: number;
}

export function installsFromPage(page: Paginated<InstallDto>): PwaInstalls {
  const devices = page.items ?? [];
  return { devices, totalDevices: page.totalItems ?? devices.length };
}

/** Devices that have run the app, and who installed it to their home screen.
 * Errors when the BarakoCMS.Pwa module isn't installed on this host. */
export function usePwaInstalls() {
  return useQuery({
    queryKey: ['pwa', 'installs'],
    queryFn: async () =>
      installsFromPage(
        (
          await api.get<Paginated<InstallDto>>('/api/pwa/installs', {
            params: { page: 1, pageSize: INSTALLS_PAGE_SIZE },
          })
        ).data,
      ),
  });
}
