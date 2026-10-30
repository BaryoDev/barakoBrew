import { expect, test } from '@playwright/test';

test.describe('Security headers', () => {
    test('every page response carries the hardening headers and an enforced CSP', async ({ request }) => {
        const response = await request.get('/');
        const headers = response.headers();

        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');

        // Enforced, not report-only.
        expect(headers['content-security-policy-report-only']).toBeUndefined();
        const csp = headers['content-security-policy'] ?? '';
        for (const directive of [
            "default-src 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]) {
            expect(csp).toContain(directive);
        }
    });

    test('the sign-in page is not blocked by its own policy', async ({ page }) => {
        const violations: string[] = [];
        page.on('console', (message) => {
            if (message.text().includes('Content Security Policy')) violations.push(message.text());
        });
        await page.goto('/login');
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
        expect(violations).toEqual([]);
    });
});
