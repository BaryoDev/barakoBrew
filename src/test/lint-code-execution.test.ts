// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';

/**
 * Code that runs a string, and React's raw HTML prop, are how injected text becomes injected script.
 * `eslint.config.mjs` makes them errors. A rule nobody has seen fail may not be switched on, so this
 * lints each one with the repository's own config and expects the error.
 */

const MARKDOWN_FIELD = 'src/components/content/markdown-field.tsx';
const PROBE_PATHS = ['src/app/probe.tsx', 'src/components/probe.tsx', 'packages/content-form/src/probe.tsx'];

const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(source: string, filePath: string, ruleId: string) {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.filter((m) => m.ruleId === ruleId);
}

const DANGER = 'export const A = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n';
const EVAL = 'export const run = (code: string) => eval(code);\n';
const IMPLIED_EVAL = 'export const run = (code: string) => setTimeout(code, 1);\n';

describe('lint refuses code that runs a string', () => {
    it.each(PROBE_PATHS)('react/no-danger is an error in %s', async (filePath) => {
        const messages = await messagesFor(DANGER, filePath, 'react/no-danger');
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
    }, 60_000);

    it('no-eval is an error', async () => {
        const messages = await messagesFor(EVAL, PROBE_PATHS[0], 'no-eval');
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
    }, 60_000);

    it('no-implied-eval is an error', async () => {
        const messages = await messagesFor(IMPLIED_EVAL, PROBE_PATHS[0], 'no-implied-eval');
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
    }, 60_000);

    it('the markdown preview is the one reviewed exception, and it says why', async () => {
        const source = readFileSync(MARKDOWN_FIELD, 'utf8');
        expect(source).toContain('eslint-disable-next-line react/no-danger');
        expect(source.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
        expect(await messagesFor(source, MARKDOWN_FIELD, 'react/no-danger')).toEqual([]);
    }, 60_000);
});
