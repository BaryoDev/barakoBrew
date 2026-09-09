// The vitest entry, not the bare one. Both register the matchers at runtime, but only this one
// augments vitest's own Assertion type, so with the bare import `toBeInTheDocument` type-checks by
// accident under some versions and not others. Under vitest 5 it stopped, and the test run stayed
// green while `tsc --noEmit` failed, which is the wrong way round for a type-only problem.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});
