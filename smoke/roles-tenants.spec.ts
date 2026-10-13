import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { smokeApiUrl } from './api-url';
import { isGlobalRoleCandidate, roleOwner, type Role } from '../src/types/rbac';
import { TENANT_STATUSES, tenantDomainsBody, tenantStatusLabel, type Tenant } from '../src/types/tenant';

/**
 * The role and tenant shapes the console reads, and the tenant write it sends, against the real API.
 *
 * barakoCMS 5.0 (contract 8) gives a role an owner and a tenant a status. The console keys every
 * decision on whether those fields are there, not on the contract number, so a 4.x API that sends
 * neither keeps the old behaviour. The mocked pack cannot tell the two apart: its fixtures carry
 * whatever the person writing them believed. This reads both from the server, and asserts the branch
 * the reported contract version says applies.
 *
 * What it leaves behind: one tenant, Suspended on contract 8 and inactive before it. The API has no
 * route to delete a tenant. The role it makes is deleted.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

function contractOf(response: APIResponse): number {
    const version = Number(response.headers()['x-api-contract-version']);
    expect(Number.isInteger(version), 'the API reports its contract version').toBe(true);
    return version;
}

async function roles(request: APIRequestContext): Promise<{ contract: number; items: Role[] }> {
    const response = await request.get(`${API}/api/roles?page=1&pageSize=100`, { headers });
    expect(response.status(), 'GET /api/roles').toBe(200);
    const page: { items: Role[] } = await response.json();
    return { contract: contractOf(response), items: page.items };
}

test.beforeAll(() => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');
});

test('roles carry their owner from contract 8, and the global role menu offers what the API takes', async ({ request }) => {
    const before = await roles(request);
    expect(before.items.length, 'the seeded roles are listed').toBeGreaterThan(0);

    const name = `smoke-role-${Date.now().toString(36)}`;
    const created = await request.post(`${API}/api/roles`, {
        headers,
        data: { name, description: 'smoke', permissions: [], systemCapabilities: [] },
    });
    expect(created.status(), `POST /api/roles answered ${await created.text()}`).toBe(200);
    const { id }: { id: string } = await created.json();

    try {
        const { contract, items } = await roles(request);
        const mine = items.find((r) => r.id === id);
        expect(mine, 'the created role is listed').toBeTruthy();
        const superAdmin = items.find((r) => r.name === 'SuperAdmin');
        expect(superAdmin, 'the seeded SuperAdmin role is listed').toBeTruthy();

        if (contract >= 8) {
            for (const role of items) {
                expect(typeof role.isPlatform, `${role.name}.isPlatform`).toBe('boolean');
                expect(role.tenantSlug === null || typeof role.tenantSlug === 'string', `${role.name}.tenantSlug`).toBe(true);
            }
            expect(roleOwner(superAdmin!)).toBe('Platform');
            expect(roleOwner(mine!)).toBe('default');
            expect(isGlobalRoleCandidate(superAdmin!)).toBe(true);
            expect(isGlobalRoleCandidate(mine!), 'a tenant role is not offered as a global role').toBe(false);

            // The reason it is not offered: the API refuses it there, in words the toast shows.
            const users = await request.get(`${API}/api/users?page=1&pageSize=1`, { headers });
            const [user]: { id: string }[] = (await users.json()).items;
            expect(user, 'a user to give the role to').toBeTruthy();
            const assigned = await request.post(`${API}/api/users/${user.id}/roles`, {
                headers,
                data: { userId: user.id, roleId: id },
            });
            expect(assigned.status(), 'a tenant role given globally').toBe(400);
            expect((await assigned.json()).message).toContain(name);

            const again = await request.post(`${API}/api/roles`, {
                headers,
                data: { name, description: 'smoke', permissions: [], systemCapabilities: [] },
            });
            expect(again.status(), 'a second role of the same name in the tenant').toBe(409);
        } else {
            for (const role of items) {
                expect(role, `${role.name} reports no owner before contract 8`).not.toHaveProperty('isPlatform');
                expect(roleOwner(role)).toBeNull();
                expect(isGlobalRoleCandidate(role)).toBe(true);
            }
        }
    } finally {
        await request.delete(`${API}/api/roles/${id}`, { headers });
    }
});

test('a tenant reads its status from contract 8, and a domains edit keeps it', async ({ request }) => {
    const handle = `smoke-${Date.now().toString(36)}`;
    const created = await request.post(`${API}/api/tenants`, {
        headers,
        data: { Handle: handle, Name: 'Smoke tenant', IsActive: true },
    });
    expect(created.status(), `POST /api/tenants answered ${await created.text()}`).toBe(200);
    const contract = contractOf(created);
    const tenant: Tenant = await created.json();
    expect(tenant.isActive).toBe(true);

    const paused = await request.put(`${API}/api/tenants/${handle}`, {
        headers,
        data: contract >= 8
            ? { Handle: handle, Name: 'Smoke tenant', Status: 'Suspended' }
            : { Handle: handle, Name: 'Smoke tenant', IsActive: false },
    });
    expect(paused.status(), `switching the tenant off answered ${await paused.text()}`).toBe(200);

    const listed = await request.get(`${API}/api/tenants`, { headers });
    expect(listed.status(), 'GET /api/tenants').toBe(200);
    const read = ((await listed.json()).items as Tenant[]).find((t) => t.slug === handle);
    expect(read, 'the tenant is listed').toBeTruthy();
    expect(read!.isActive).toBe(false);

    if (contract >= 8) {
        expect(read!.status).toBe('Suspended');
        expect(TENANT_STATUSES).toContain(read!.status);
        expect(tenantStatusLabel(read!)).toBe('Suspended');
    } else {
        expect(read).not.toHaveProperty('status');
        expect(tenantStatusLabel(read!)).toBe('Inactive');
    }

    // The console's own body. On contract 8 a write naming neither the status nor the flag makes the
    // tenant Active, so a body that dropped both would switch the tenant back on here.
    const saved = await request.put(`${API}/api/tenants/${handle}`, {
        headers,
        data: tenantDomainsBody(read!, [`${handle}.example`]),
    });
    expect(saved.status(), `the domains edit answered ${await saved.text()}`).toBe(200);
    const after: Tenant = await saved.json();
    expect(after.domains).toEqual([`${handle}.example`]);
    expect(after.isActive, 'a domains edit leaves the tenant switched off').toBe(false);
    if (contract >= 8) expect(after.status).toBe('Suspended');
});
