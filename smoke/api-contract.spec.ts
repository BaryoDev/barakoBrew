import { test, expect } from '@playwright/test';
import { SUPPORTED_CONTRACT } from '../src/lib/api-contract';

/**
 * The API's contract version, held against the range this console speaks.
 *
 * Nothing mocked can make this assertion. `e2e/helpers.ts` fills the header in from
 * `SUPPORTED_CONTRACT` itself, so the fixture agrees with the console by construction and stays green
 * against any API at all. This is the same class of gap as the enum check next to it: a number the
 * console believes about the server, with nothing holding the two together.
 *
 * What it catches is the deployment order. The console refuses to render against a contract version
 * it does not speak, so an API that moves ahead of it does not break one screen, it takes the whole
 * product to a single page of explanation. Against the API image this pack runs, a green run here is
 * the statement that this build of the console may be deployed with that build of the API.
 *
 * Unauthenticated on purpose, and its own file rather than a test inside `contract.spec.ts`. The
 * header is on every response including a 401, which is what lets the console judge the API before
 * anybody signs in, and asserting it without a session proves that rather than assuming it. It also
 * keeps this out of the serial sign-in in that file: a contract mismatch is exactly what makes
 * signing in fail, and a skipped test cannot report the reason.
 */

// The API, not the console. The pack's baseURL is the admin under test.
const API = process.env.SMOKE_API_URL || 'http://127.0.0.1:5099';

test('the API reports a contract version this console speaks', async ({ request }) => {
    // No Authorization header, so this answers 401, and the header under test is on that too.
    const response = await request.get(`${API}/api/contents?page=1&pageSize=1`);

    // Lowercased, the way Playwright, the browser and axios all hand headers over, which is the form
    // the console parses.
    const header = response.headers()['x-api-contract-version'];
    expect(
        header,
        `the API answered ${response.status()} with no X-Api-Contract-Version. The console reads that `
            + 'header to decide whether it can drive the API, and treats its absence as an API too old '
            + 'to report one, so it would refuse to start.'
    ).toBeTruthy();

    const version = Number(header);
    expect(Number.isInteger(version), `X-Api-Contract-Version was '${header}'`).toBe(true);

    const mismatch =
        `the API speaks contract ${version}, this console speaks `
        + `${SUPPORTED_CONTRACT.min} to ${SUPPORTED_CONTRACT.max}. `
        + 'One of the two is being deployed without the other.';

    expect(version, mismatch).toBeGreaterThanOrEqual(SUPPORTED_CONTRACT.min);
    expect(version, mismatch).toBeLessThanOrEqual(SUPPORTED_CONTRACT.max);
});
