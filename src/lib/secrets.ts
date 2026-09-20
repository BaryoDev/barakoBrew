/**
 * The options every mutation whose result carries a secret must spread.
 *
 * TanStack Query keeps a finished mutation, result and all, for five minutes after the last
 * observer goes. That outlives the dialog that showed the secret: anything else running in the page
 * can read it back, and it survives a navigation. `gcTime: 0` drops the mutation the moment nothing
 * observes it, so calling `reset()` once the value is in component state, or leaving the screen,
 * removes the only copy the library held.
 *
 * The query cache has no such tie to a screen, so a secret is never written to it: no
 * `setQueryData`, and no query key that would refetch one.
 *
 * `src/hooks/secret-mutations.cache.test.tsx` holds every hook in the console to this.
 */
export const SECRET_MUTATION = { gcTime: 0 } as const;
