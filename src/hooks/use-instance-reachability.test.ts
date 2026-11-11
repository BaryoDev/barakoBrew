import { describe, it, expect } from 'vitest';
import { isReachableStatus } from './use-instance-reachability';

describe('isReachableStatus', () => {
    it('reads a proxy with nothing behind it as unreachable', () => {
        for (const status of [502, 503, 504]) expect(isReachableStatus(status)).toBe(false);
    });

    it('reads any other answer as the API being there', () => {
        for (const status of [200, 401, 404, 500]) expect(isReachableStatus(status)).toBe(true);
    });
});
