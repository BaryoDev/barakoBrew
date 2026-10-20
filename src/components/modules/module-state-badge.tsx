import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { MODULE_STATE_LABEL, type ModuleState } from '@/lib/module-state';

const TONE: Record<ModuleState, Tone> = {
    enabled: 'success',
    installed: 'warning',
    'not-installed': 'subtle',
};

export function ModuleStateBadge({ state }: { state: ModuleState }) {
    return <StatusBadge tone={TONE[state]}>{MODULE_STATE_LABEL[state]}</StatusBadge>;
}
