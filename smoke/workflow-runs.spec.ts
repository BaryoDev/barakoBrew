import { test, expect, type APIRequestContext } from '@playwright/test';
import { smokeApiUrl } from './api-url';

/**
 * The two fields the workflow screens read to say why a run failed and what a log left out, against
 * the server that sends them.
 *
 * `retryable` sits on each action of a run and decides whether the console says Temporary or
 * Permanent, and whether Retry asks first. `redacted` sits on each execution log and decides whether
 * the console says credentials were not stored. Both are optional in the console's types, so a
 * renamed or dropped field would not fail anything in the mocked pack: the labels would quietly stop
 * appearing. This reads the real responses and fails on the name or the type.
 *
 * Both arrived in barakoCMS 4.2.0, so this needs an API at least that new. The release pull requests
 * pin and the nightly's master both are.
 *
 * What it leaves behind: the workflow. The API has no endpoint to delete one, so it is created with
 * a condition only this run's entry meets and never fires again. The entry itself is erased.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

/** How long the API gets to queue a run, and then to run its one action. */
const DEADLINE_MS = 60_000;

interface Action {
    ordinal: number;
    actionType: string;
    status: string;
    retryable?: unknown;
}

interface Run {
    id: string;
    workflowDefinitionId: string;
    status: string;
    actions: Action[];
}

async function runOf(request: APIRequestContext, workflowId: string): Promise<Run | undefined> {
    const response = await request.get(`${API}/api/workflow-runs?page=1&pageSize=50`, { headers });
    expect(response.status(), 'GET /api/workflow-runs').toBe(200);
    const page: { items: Run[] } = await response.json();
    return page.items.find((run) => run.workflowDefinitionId === workflowId);
}

test('a run carries retryable on every action, and an execution log carries redacted', async ({ request }) => {
    test.setTimeout(DEADLINE_MS * 2 + 60_000);
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const marker = `workflow smoke ${Date.now().toString(36)}`;

    // A webhook to loopback. The API refuses a loopback address before it opens a socket, so the
    // action fails the same way every time, with no network and no DNS involved, and the API records
    // that failure as one a retry cannot fix.
    const created = await request.post(`${API}/api/workflows`, {
        headers,
        data: {
            name: marker,
            triggerContentType: 'smokeauthor',
            triggerEvent: 'Created',
            conditions: { Name: marker },
            actions: [{ type: 'Webhook', parameters: { Url: 'http://127.0.0.1:9/barako-smoke' } }],
        },
    });
    expect(created.status(), `POST /api/workflows answered ${await created.text()}`).toBe(200);
    const workflow: { id: string } = await created.json();
    expect(workflow.id, 'the created workflow carries its id').toBeTruthy();

    const entry = await request.post(`${API}/api/contents`, {
        headers,
        data: { contentType: 'smokeauthor', data: { Name: marker }, status: 'Published' },
    });
    expect(entry.ok(), `POST /api/contents answered ${entry.status()}`).toBeTruthy();
    const { id: entryId }: { id: string } = await entry.json();

    try {
        // The shape first, on whatever state the run is in. Every action carries the key, null
        // unless it failed, so this does not depend on the runner having got to it.
        await expect
            .poll(async () => Boolean(await runOf(request, workflow.id)), {
                timeout: DEADLINE_MS,
                intervals: [1_000],
                message: `no run appeared for the workflow within ${DEADLINE_MS / 1000} s of creating its entry`,
            })
            .toBe(true);

        const queued = (await runOf(request, workflow.id))!;
        expect(queued.actions).toHaveLength(1);
        for (const action of queued.actions) {
            expect(action, 'an action of a run has no retryable key at all').toHaveProperty('retryable');
            expect(
                action.retryable === null || typeof action.retryable === 'boolean',
                `retryable arrived as ${JSON.stringify(action.retryable)}, and the console reads only true, false and null`,
            ).toBe(true);
        }

        // Then the value on a failure, which is the case the labels are for.
        await expect
            .poll(async () => (await runOf(request, workflow.id))?.actions[0]?.status, {
                timeout: DEADLINE_MS,
                intervals: [1_000],
                message: `the webhook to loopback had not failed within ${DEADLINE_MS / 1000} s`,
            })
            .toBe('Failed');

        const failed = (await runOf(request, workflow.id))!.actions[0];
        expect(failed.retryable, 'a refused address is a failure a retry cannot fix').toBe(false);

        // A dry run stores an execution log under the workflow's id, which is the cheapest way to
        // have one: nothing is sent.
        const dryRun = await request.post(`${API}/api/workflows/dry-run`, {
            headers,
            data: { workflow, sampleContent: { contentType: 'smokeauthor', data: { Name: marker } } },
        });
        expect(dryRun.status(), 'POST /api/workflows/dry-run').toBe(200);

        const debug = await request.get(`${API}/api/workflows/${workflow.id}/debug`, { headers });
        expect(debug.status(), 'GET /api/workflows/{id}/debug').toBe(200);
        const logs: { id: string; redacted?: unknown }[] = await debug.json();

        expect(logs.length, 'the dry run left no execution log to read').toBeGreaterThan(0);
        for (const log of logs) {
            expect(typeof log.redacted, `log ${log.id} arrived with redacted as ${JSON.stringify(log.redacted)}`).toBe(
                'boolean',
            );
        }
    } finally {
        const erased = await request.delete(`${API}/api/contents/${entryId}/erase`, { headers });
        expect(erased.status(), 'the entry this spec created could not be erased').toBe(204);
    }
});
