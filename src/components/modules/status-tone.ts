import type { Tone } from '@/components/patterns/status-badge';

/**
 * The status words a module table shows and the tone each one takes, from the round 3 drawing.
 * Resolved, Active and Inactive are not in the drawing; the diagnostics and accounting tables need
 * them, and they sit with the words that mean the same.
 */
const OK = ['Published', 'Succeeded', 'Delivered', 'Sent', 'On', 'Pass', 'Paid', 'Resolved', 'Active'];
const BAD = ['Bounced', 'Failed'];
const WARN = ['Partly failed', 'Warn', 'Open'];
const MUTED = ['Draft', 'Off', 'Void', 'Never', 'Inactive'];

const TONES = new Map<string, Tone>([
    ...OK.map((w): [string, Tone] => [w, 'success']),
    ...BAD.map((w): [string, Tone] => [w, 'destructive']),
    ...WARN.map((w): [string, Tone] => [w, 'warning']),
    ...MUTED.map((w): [string, Tone] => [w, 'muted']),
]);

/** A word the drawing does not list gets the quiet tone, never a colour that claims a meaning. */
export function statusTone(word: string): Tone {
    return TONES.get(word) ?? 'subtle';
}
