import { describe, expect, it } from 'vitest';
import { rebaseEdit, rebaseMapEdit } from './rebase';

describe('rebaseMapEdit', () => {
    it('moves a nested map forward key by key, so their change to another option is kept', () => {
        const base = { Kind: { x: 'red', y: 'blue' } };
        const mine = { Kind: { x: 'green', y: 'blue' } };
        const theirs = { Kind: { x: 'red', y: 'pink' } };

        expect(rebaseMapEdit(base, mine, theirs)).toEqual({ Kind: { x: 'green', y: 'pink' } });
    });

    it('replaces a value that is not a map whole', () => {
        expect(rebaseMapEdit(['a'], ['b'], ['a', 'c'])).toEqual(['b']);
        expect(rebaseMapEdit({ a: '1' }, { a: '2' }, 'text')).toEqual({ a: '2' });
    });
});

describe('rebaseEdit', () => {
    it('keeps their change to a field this edit did not touch', () => {
        const base = { Title: 'draft', Body: 'one' };
        const mine = { Title: 'my title', Body: 'one' };
        const theirs = { Title: 'draft', Body: 'their body' };

        const { data, collisions } = rebaseEdit(base, mine, theirs);

        expect(collisions).toHaveLength(0);
        expect(data).toEqual({ Title: 'my title', Body: 'their body' });
    });

    it('keeps a field they added that this edit has never seen', () => {
        const { data, collisions } = rebaseEdit(
            { Title: 'draft' },
            { Title: 'mine' },
            { Title: 'draft', Summary: 'theirs' },
        );

        expect(collisions).toHaveLength(0);
        expect(data).toEqual({ Title: 'mine', Summary: 'theirs' });
    });

    it('names a field both sides changed rather than picking a winner', () => {
        const { data, collisions } = rebaseEdit(
            { Title: 'draft' },
            { Title: 'mine' },
            { Title: 'theirs' },
        );

        expect(collisions).toEqual(['Title']);
        // The edit is still in the data so nothing typed is thrown away. The caller refuses the
        // save on the collision rather than sending this.
        expect(data).toEqual({ Title: 'mine' });
    });

    it('does not call the same change on both sides a collision', () => {
        const { collisions } = rebaseEdit({ Title: 'draft' }, { Title: 'same' }, { Title: 'same' });

        expect(collisions).toHaveLength(0);
    });

    it('names a nested key with its path, and merges the rest of the map', () => {
        const base = { Colors: { accent: 'red', ink: 'black' } };
        const mine = { Colors: { accent: 'green', ink: 'black' } };
        const theirs = { Colors: { accent: 'blue', ink: 'navy' } };

        const { data, collisions } = rebaseEdit(base, mine, theirs);

        expect(collisions).toEqual(['Colors.accent']);
        expect(data).toEqual({ Colors: { accent: 'green', ink: 'navy' } });
    });

    it('removes a key this edit removed, and names it when they changed it', () => {
        const kept = rebaseEdit({ a: '1', b: '2' }, { a: '1' }, { a: '1', b: '2' });
        expect(kept.collisions).toHaveLength(0);
        expect(kept.data).toEqual({ a: '1' });

        const argued = rebaseEdit({ a: '1', b: '2' }, { a: '1' }, { a: '1', b: 'theirs' });
        expect(argued.collisions).toEqual(['b']);
    });

    it('adds a field this edit added, with no argument about it', () => {
        const { data, collisions } = rebaseEdit({ a: '1' }, { a: '1', b: 'new' }, { a: '1' });

        expect(collisions).toHaveLength(0);
        expect(data).toEqual({ a: '1', b: 'new' });
    });
});
