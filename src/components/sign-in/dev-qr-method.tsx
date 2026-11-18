'use client';

import { IconMobile } from '@/components/icons';
import { createQrApprovalApi } from '@/hooks/use-qr-approval';
import { QrApprovalPanel } from './qr-approval-panel';
import type { SignInMethodEntry, SignInPanelProps } from './types';

const api = createQrApprovalApi({ createPath: '/api/dev-fixture/qr/create', pollPath: '/api/dev-fixture/qr/poll' });

function DevQrPanel({ flow }: SignInPanelProps) {
    return <QrApprovalPanel flow={flow} api={api} />;
}

/**
 * Stands in for a package's registration so the browser tests can draw a registered tab. It is
 * registered on the development server only (see registry.ts) and the routes are mocked by the spec.
 */
export const devQrMethod: SignInMethodEntry = {
    id: 'dev-qr',
    label: 'Phone',
    icon: IconMobile,
    Panel: DevQrPanel,
};
