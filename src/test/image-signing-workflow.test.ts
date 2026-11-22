import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The published image is signed and attested by digest under both names, verified, and only then
 * do the floating tags move. These read .github/workflows/publish.yml as text, the way
 * scripts/check-workflow-permissions.py does, so each rule fails on its own when the workflow
 * stops following it.
 */

const WORKFLOW = readFileSync('.github/workflows/publish.yml', 'utf8');
const README = readFileSync('README.md', 'utf8');

const IDENTITY =
    "'^https://github\\.com/BaryoDev/barakoBrew/\\.github/workflows/publish\\.yml@refs/(heads/master|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?)$'";
const ISSUER = 'https://token.actions.githubusercontent.com';
const NAMES = ['barako-brew', 'barako-admin'];

/** The text of one top-level job, from its key to the next job. */
function job(id: string): string {
    const jobs = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'));
    const start = jobs.indexOf(`\n  ${id}:\n`);
    expect(start, `job ${id} is missing`).toBeGreaterThan(-1);
    const rest = jobs.slice(start + 1);
    const next = rest.slice(1).search(/\n  [a-z][a-z-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The steps of a job, each as its own block of text. */
function steps(id: string): { name: string; text: string }[] {
    const body = job(id).split('\n    steps:\n')[1] ?? '';
    return body
        .split(/\n(?=      - )/)
        .filter((t) => t.trim())
        .map((text) => ({ name: /name: (.*)/.exec(text)?.[1] ?? '', text }));
}

function step(id: string, name: RegExp) {
    const found = steps(id).filter((s) => name.test(s.name));
    expect(found.length, `expected one step matching ${name} in ${id}`).toBe(1);
    return found[0];
}

const publishSteps = () => steps('publish');
const indexOfStep = (name: RegExp) => publishSteps().findIndex((s) => name.test(s.name));

const SIGN = /^Sign the image/;
const ATTEST_ALL = /^Attest build provenance/;
const VERIFY_ATTEST = /^Verify the provenance attestation/;
const CREATE = /^Create the manifest list/;
const MOVE = /^Move the floating tags/;

describe('publish.yml signs and attests the image', () => {
    it('signs and attests by digest under every name it pushes, never by tag', () => {
        const sign = step('publish', SIGN).text;
        for (const name of NAMES) expect(sign).toContain(name);
        expect(sign).toContain('cosign sign --yes "ghcr.io/baryodev/$name@$DIGEST"');
        expect(sign, 'a signature on a tag can be left behind by a moved tag').not.toMatch(
            /cosign sign[^\n]*(?<!@)\$?[A-Za-z_]*:[A-Za-z$]/
        );

        const attests = publishSteps().filter((s) => ATTEST_ALL.test(s.name));
        expect(attests.map((a) => /subject-name: (\S+)/.exec(a.text)?.[1]).sort()).toEqual(
            NAMES.map((n) => `ghcr.io/baryodev/${n}`).sort()
        );
        for (const a of attests) {
            expect(a.text).toContain('subject-digest: ${{ steps.tags.outputs.digest }}');
            expect(a.text).toContain('push-to-registry: true');
        }

        const verifyAttest = step('publish', VERIFY_ATTEST).text;
        expect(verifyAttest).toContain('for name in barako-brew barako-admin; do');
        expect(verifyAttest).toContain('cosign verify-attestation --type slsaprovenance1');
        expect(verifyAttest).toContain('"ghcr.io/baryodev/$name@$DIGEST"');
        expect(sign).toContain('for name in barako-brew barako-admin; do');
    });

    it('gives id-token and attestations write only to the job that signs', () => {
        for (const id of ['version', 'verify', 'build', 'release', 'close-milestone', 'playground-image', 'deploy-playground']) {
            expect(job(id), `${id} must not hold signing permissions`).not.toMatch(
                /(id-token|attestations): write/
            );
        }
        const publish = job('publish').split('\n    steps:\n')[0];
        expect(publish).toContain('      id-token: write\n');
        expect(publish).toContain('      attestations: write\n');
        const build = job('build').split('\n    steps:\n')[0];
        expect(build).toContain('      contents: read\n      packages: write\n');
    });

    it('pins the identity to this workflow file, master and a v tag, anchored, with the GitHub issuer', () => {
        const verifying = [
            step('publish', SIGN).text,
            step('publish', VERIFY_ATTEST).text,
        ];
        for (const text of verifying) {
            expect(text).toContain(`IDENTITY_REGEXP: ${IDENTITY}`);
            expect(text).toContain(`OIDC_ISSUER: ${ISSUER}`);
            expect(text).toContain('--certificate-identity-regexp "$IDENTITY_REGEXP"');
            expect(text).toContain('--certificate-oidc-issuer "$OIDC_ISSUER"');
            expect(text).not.toContain('--certificate-identity ');
        }
        expect(step('publish', SIGN).text).toContain('cosign verify \\');
        // The command an operator is told to run carries the same identity.
        expect(README).toContain(IDENTITY.slice(1, -1));
        expect(README).toContain(ISSUER);
    });

    it('moves floating tags only after sign, attest and verify, copied from the verified digest', () => {
        const create = indexOfStep(CREATE);
        const sign = indexOfStep(SIGN);
        const verifyAttest = indexOfStep(VERIFY_ATTEST);
        const move = indexOfStep(MOVE);
        expect(create).toBeGreaterThan(-1);
        expect(create).toBeLessThan(sign);
        expect(sign).toBeLessThan(verifyAttest);
        expect(verifyAttest).toBeLessThan(move);

        // Nothing floating is created before the signature.
        const before = publishSteps().slice(0, move);
        for (const s of before) {
            expect(s.text, `${s.name} must not move a floating tag`).not.toMatch(
                /--tag [^\n]*(:latest|:dev"|:dev |FLOATING|:\$t)/
            );
        }
        expect(step('publish', CREATE).text).toContain('--tag "$IMG:$IMMUTABLE"');

        const moveText = step('publish', MOVE).text;
        expect(moveText).toContain('"ghcr.io/baryodev/$name@$DIGEST"');
        expect(moveText).toContain('--tag "ghcr.io/baryodev/$name:$t"');
        expect(moveText, 'floating tags must not be copied from another tag').not.toMatch(
            /imagetools create[^\n]*"ghcr\.io\/baryodev\/[^"\n]*:\$(IMMUTABLE|VERSION)"/
        );

        // The Docker Hub mirror and every later job wait for the move as well.
        const mirror = indexOfStep(/^Mirror to Docker Hub$/);
        expect(mirror).toBeGreaterThan(move);
    });

    it('fails the job on a failed verify and runs the floating move only when everything before passed', () => {
        for (const re of [CREATE, SIGN, ATTEST_ALL, VERIFY_ATTEST, MOVE]) {
            for (const s of publishSteps().filter((x) => re.test(x.name))) {
                expect(s.text, `${s.name} must not continue on error`).not.toMatch(/continue-on-error/);
                expect(s.text, `${s.name} must not swallow a failure`).not.toMatch(/\|\| (true|:)/);
                expect(s.text, `${s.name} must run only after success`).not.toMatch(
                    /\n\s+if: .*(always\(\)|failure\(\)|cancelled\(\))/
                );
            }
        }
        for (const re of [SIGN, VERIFY_ATTEST, MOVE]) {
            expect(step('publish', re).text).toContain('set -euo pipefail');
        }
        expect(step('publish', VERIFY_ATTEST).text).not.toMatch(/> \/dev\/null 2>&1|set \+e/);
    });
});
