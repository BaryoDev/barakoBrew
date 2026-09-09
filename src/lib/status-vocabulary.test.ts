import { describe, it, expect } from 'vitest';
import { ContentStatus } from '@/types/content';
import { STATUS_VOCABULARY, statusMeta, type StatusKey } from './status-vocabulary';

/**
 * The five states the design fixes, and the one rule that outranks all of them.
 *
 * Every case here exists because the mapping used to live per screen. Two screens agreeing today is
 * not the same as one place deciding, and the pairs are measured colours, not opinions, so a screen
 * picking its own tone is a contrast regression waiting to happen.
 */
describe('the status vocabulary', () => {
    it('covers the five states the design fixes and nothing else', () => {
        // A sixth state is a decision entry, not an edit to this object. That is the whole reason
        // the list is asserted rather than just spot-checked: adding one here has to fail a test
        // first, so nobody adds Posted or Unbalanced on the way past.
        expect(Object.keys(STATUS_VOCABULARY).sort()).toEqual([
            'Archived',
            'Draft',
            'InReview',
            'Published',
            'Scheduled',
        ]);
    });

    it('gives each state the tone its measured pair belongs to', () => {
        // Ink on ground, from the design's table:
        //   Draft      #4A4E66 on #F2F3F9  muted     7.37:1
        //   In review  #8A5A10 on #FDF2E3  warning   5.35:1
        //   Scheduled  #4034A8 on #EEEBFD  accent    7.89:1
        //   Published  #0B7A6B on #E6F7F4  success   4.73:1
        //   Archived   #63687D on #F2F3F9  subtle    4.98:1
        expect(STATUS_VOCABULARY.Draft.tone).toBe('muted');
        expect(STATUS_VOCABULARY.InReview.tone).toBe('warning');
        expect(STATUS_VOCABULARY.Scheduled.tone).toBe('accent');
        expect(STATUS_VOCABULARY.Published.tone).toBe('success');
        expect(STATUS_VOCABULARY.Archived.tone).toBe('subtle');
    });

    it('keeps Draft and Archived apart even though both sit on the sunken tint', () => {
        // The two greys share a ground and differ in ink, so mapping both to one tone would look
        // like a tidy-up and would lose the distinction the design draws: an archived entry is
        // meant to read quieter than a draft, not identical to it.
        expect(STATUS_VOCABULARY.Draft.tone).not.toBe(STATUS_VOCABULARY.Archived.tone);
    });

    it('does not give Draft the warning tone, which now belongs to In review', () => {
        // Draft was warning before this module existed. In review is the state that blocks a
        // publish, so warning is its pair now, and a screen still drawing an amber Draft is out of
        // date rather than merely inconsistent.
        expect(STATUS_VOCABULARY.Draft.tone).not.toBe('warning');
    });

    it('spells In review the way a reader reads it, not the way the API spells it', () => {
        // The key is the wire value and the label is English. They differ for exactly one state, so
        // returning the key as the label would go unnoticed on the other four.
        expect(STATUS_VOCABULARY.InReview.label).toBe('In review');
    });

    it('has an entry for every status the API enum declares', () => {
        // `Record<StatusKey, ...>` catches a missing key at compile time. This is about the enum and
        // the vocabulary staying in step with each other: ContentStatus mirrors the server, the
        // vocabulary mirrors the design, and a status the server sends that the design has never
        // named falls through to the raw-value path below. That fallback is correct behaviour and it
        // is not a substitute for knowing about the status.
        const statuses = Object.values(ContentStatus);

        expect(statuses).toHaveLength(4);

        for (const status of statuses) {
            expect(STATUS_VOCABULARY[status as StatusKey]).toBeDefined();
        }
    });

    it('carries In review ahead of the API, which does not send it yet', () => {
        // The design fixed five states and ContentStatus has four. Holding the pair here is the
        // point: when the server starts sending InReview, no screen has to be found and edited.
        expect(Object.values(ContentStatus)).not.toContain('InReview');
        expect(STATUS_VOCABULARY.InReview).toBeDefined();
    });
});

/**
 * The rule that must survive every consolidation: the console never invents a status.
 *
 * Falling back to Draft looks harmless and is not. A row the server said nothing about renders as a
 * genuine Draft, indistinguishable from a real one, and nobody can tell from the screen that the
 * field was missing. It is reachable rather than theoretical: the admin is its own deployable and
 * picks its API at runtime from window._env_, so it can point at an older server, and the content
 * list only started returning `status` in 4.0.
 */
describe('a status the console does not know', () => {
    it('renders as its own value rather than as Draft', () => {
        expect(statusMeta('Posted')).toEqual({ label: 'Posted', tone: 'muted' });
    });

    it('says Unknown when the field is absent, rather than picking a state', () => {
        // Absent is not a state. Naming it is the honest answer, and it is what a pre-4.0 list gives
        // every row on the screen.
        expect(statusMeta(undefined)).toEqual({ label: 'Unknown', tone: 'muted' });
    });

    it('labels a scheduled entry as scheduled rather than as a draft', () => {
        // It is a draft with a date underneath, and calling it one is what the server-side status
        // exists to stop. See DECISIONS.md D12.
        expect(statusMeta(ContentStatus.Scheduled).label).toBe('Scheduled');
        expect(statusMeta(ContentStatus.Draft).label).toBe('Draft');
    });

    it('does not mistake an inherited property for a status', () => {
        // The argument is a string off the wire, so it can be any string. A plain object literal
        // answers to 'toString' and 'constructor' through the prototype, and a lookup that trusts
        // the answer hands back a function, whose .label is undefined and whose badge renders empty.
        // These are not states, so they take the raw-value path like any other unknown.
        for (const value of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
            expect(statusMeta(value)).toEqual({ label: value, tone: 'muted' });
        }
    });

    it('treats an empty string as absent rather than as a badge with no text', () => {
        // A badge with no label is a coloured smudge. Whatever produced the empty string, the
        // reader is owed a word.
        expect(statusMeta('')).toEqual({ label: 'Unknown', tone: 'muted' });
    });
});
