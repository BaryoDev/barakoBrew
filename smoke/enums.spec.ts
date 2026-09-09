import { test, expect } from '@playwright/test';
import { ContentStatus, SensitivityLevel } from '../src/types/content';
import { FieldMask } from '../src/types/schema';

/**
 * Every enum this console transcribes, held against the server's own declaration of it.
 *
 * Nothing in TypeScript can keep the two in step. A value added or dropped on the server is a
 * silent change here: the console keeps offering a filter for something that no longer exists, or
 * stops offering one for something that does, and both look like working software.
 *
 * This has already cost this project once. `ContentStatus` was numeric on both sides, transcribed
 * by hand, and `Draft` was `0`. Zero is falsy, so every truthiness check written against it meant
 * the opposite after the switch to strings, and nothing failed.
 *
 * The guarantee used to exist for one enum only: a unit test read `RunStatus` out of the API's C#
 * source in a sibling checkout. The split moved that file and the test was deleted rather than left
 * to skip, because a skipped gate is a gate that never fails (#1). This is its replacement, and it
 * covers every enum rather than the one that happened to have a test.
 *
 * Read from the OpenAPI document, which is the server's own published description of its wire
 * format rather than a copy of it. `scripts/smoke-check.sh` starts the API with `Swagger__Enabled`
 * on so the document is there to read.
 *
 * `RunStatus` is deliberately absent from the list below. The API serialises it as a bare
 * `"type": "string"` in `RunResponse` and `AttemptResponse` rather than as a named enum, so there
 * is nothing published to compare against. That is the remaining half of #1 and it is filed against
 * barakoCMS; when the API names it, one entry here closes it.
 */

/** The console's copy, and the schema name the API publishes it under. */
const MIRRORED = [
    {
        name: 'ContentStatus',
        schema: 'BarakoCMSModelsContentStatus',
        ours: Object.values(ContentStatus) as string[],
    },
    {
        name: 'SensitivityLevel',
        schema: 'BarakoCMSModelsSensitivityLevel',
        ours: Object.values(SensitivityLevel) as string[],
    },
    {
        name: 'FieldMask',
        schema: 'BarakoCMSModelsFieldMask',
        ours: Object.values(FieldMask) as string[],
    },
] as const;

interface OpenApiDocument {
    components?: { schemas?: Record<string, { enum?: string[] }> };
}

let document: OpenApiDocument;

// The API, not the console. The pack's baseURL is the admin under test, so an absolute URL is
// needed here or this asks the console for the server's description of itself.
const API = process.env.SMOKE_API_URL || 'http://127.0.0.1:5099';

test.beforeAll(async ({ request }) => {
    const response = await request.get(`${API}/swagger/v1/swagger.json`);
    expect(
        response.status(),
        'the API did not serve its OpenAPI document, so nothing below is being checked. ' +
            'scripts/smoke-check.sh starts it with Swagger__Enabled=true; a 404 here means that stopped.'
    ).toBe(200);
    document = await response.json();
});

test('the API publishes the enums this console mirrors', () => {
    // Asserted separately from the values, because a renamed or removed schema would otherwise
    // read as "no differences found" and pass. An empty comparison is the failure this catches.
    const published = Object.keys(document.components?.schemas ?? {});
    expect(published.length).toBeGreaterThan(0);

    for (const { name, schema } of MIRRORED) {
        expect(published, `${name} is not published as ${schema} any more`).toContain(schema);
        expect(
            document.components?.schemas?.[schema]?.enum,
            `${schema} is published without an enum, so its values cannot be checked`
        ).toBeDefined();
    }
});

for (const { name, schema, ours } of MIRRORED) {
    test(`${name} matches the server, value for value`, () => {
        const theirs = document.components?.schemas?.[schema]?.enum ?? [];

        // Sorted, because the order a console lists a filter in is its own business. Membership is
        // the contract: a value on one side and not the other is the drift worth failing on.
        expect(
            [...ours].sort(),
            `${name} differs from the server. The console has [${[...ours].sort().join(', ')}], ` +
                `the API publishes [${[...theirs].sort().join(', ')}].`
        ).toEqual([...theirs].sort());
    });
}
