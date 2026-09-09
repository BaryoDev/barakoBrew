import type { Tone } from '@/components/patterns/status-badge';

/**
 * One status vocabulary, for tables, editor headers, workflow nodes and the Overview list.
 *
 * The mapping used to sit on whichever screen needed it, which is how Scheduled ended up muted on
 * one screen after the design made it accent, and how In review and Scheduled had nowhere to live at
 * all. Two screens agreeing is not one place deciding. The pairs below are measured colours, so a
 * screen picking its own tone is a contrast regression waiting to happen, not a style opinion.
 *
 * A sixth state is a decision entry, not an edit to this object. See the design's status vocabulary
 * table. The open one is whether a module may contribute a row state at all: the Entries design
 * shows Posted and Unbalanced on journal-entry rows, which are Accounting concepts rather than
 * ContentStatus values, and no mechanism lets a module contribute one. Until that is settled those
 * arrive here as strings the console does not know and take the raw-value path in `statusMeta`.
 */

/**
 * Keyed by the name the API uses on the wire, not by the label.
 *
 * They differ for exactly one state, In review, which is why the label is stored rather than derived
 * from the key: deriving it would look right on the other four.
 */
export type StatusKey = 'Draft' | 'InReview' | 'Scheduled' | 'Published' | 'Archived';

export interface StatusMeta {
    label: string;
    tone: Tone;
}

/**
 * The five states and their pairs, ink on ground, from the design's table.
 *
 * The tone names are the badge's, so the colours themselves live in one place too and this file
 * names them rather than restating them. `Tone` is imported as a type, so nothing UI is pulled into
 * a bundle by a screen that only wants a label.
 */
export const STATUS_VOCABULARY: Record<StatusKey, StatusMeta> = {
    // #4A4E66 on #F2F3F9, 7.37:1. Warning used to be Draft's, before In review existed to claim it.
    Draft: { label: 'Draft', tone: 'muted' },
    // #8A5A10 on #FDF2E3, 5.35:1. Amber because it blocks a publish, which is the thing a reader has
    // to notice about it.
    InReview: { label: 'In review', tone: 'warning' },
    // #4034A8 on #EEEBFD, 7.89:1. Accent since the 8 Sept bundle. Anything still mapping it to muted
    // is out of date.
    Scheduled: { label: 'Scheduled', tone: 'accent' },
    // #0B7A6B on #E6F7F4, 4.73:1.
    Published: { label: 'Published', tone: 'success' },
    // #63687D on #F2F3F9, 4.98:1. Same ground as Draft, quieter ink, which is the only thing telling
    // the two greys apart.
    Archived: { label: 'Archived', tone: 'subtle' },
};

/**
 * The order the segmented control and any status picker use.
 *
 * Written out rather than taken from `Object.keys`, because key order is an implementation detail of
 * the object above and the reading order is a design decision: Published first, then the states on
 * the way to it, then the one that leaves.
 */
export const STATUS_ORDER: StatusKey[] = ['Published', 'Draft', 'InReview', 'Scheduled', 'Archived'];

/**
 * The badge for a status, without inventing one the server did not send.
 *
 * Falling back to Draft looks harmless and is not: a row the server said nothing about renders as a
 * genuine Draft, indistinguishable from a real one. Nobody can tell from the screen that the field
 * was missing.
 *
 * It is reachable rather than theoretical. The admin is its own deployable and picks its API at
 * runtime from window._env_, so it can point at an older server, and the content list only started
 * returning `status` in 4.0. A 4.0 admin against any currently released API would label every row
 * Draft. Showing the raw value is worse-looking and better: it says the two are out of step, which is
 * exactly the drift these changes exist to stop hiding.
 *
 * `Object.hasOwn` rather than a plain lookup: the argument is a string off the wire, so it can be
 * any string, and a bare object literal answers to 'toString' and 'constructor' through the
 * prototype. That lookup returns a function, whose `.label` is undefined, and the badge renders
 * empty.
 */
export function statusMeta(status: string | undefined): StatusMeta {
    if (status && Object.hasOwn(STATUS_VOCABULARY, status)) {
        return STATUS_VOCABULARY[status as StatusKey];
    }

    // Muted, not subtle: an unknown value is the loud case, not the retired one.
    return { label: status || 'Unknown', tone: 'muted' };
}
