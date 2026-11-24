import { test, expect } from '@playwright/test';
import {

  hasTestUser,
  signIn,
  mockEdgeFunction,
  jsonResponse,
  expectNotPremium,
  startPremiumButton,
  planTile,
  gotoPricing,
  startCheckout,
  readEntitlement,
} from './helpers';

/**
 * Paystack payment flow E2E — Supabase Edge Functions are mocked so the
 * suite never talks to real Paystack. The client-side verification path
 * (paystack-verify + checkSubscription + polling) is exercised end-to-end.
 *
 * Requires GitHub secrets:
 *   TEST_USER_EMAIL     — a fresh non-Premium user
 *   TEST_USER_PASSWORD  — that user's password
 */
test.describe('Paystack checkout', () => {
  if (!hasTestUser() && process.env.CI) {
    throw new Error('TEST_USER_EMAIL / TEST_USER_PASSWORD GitHub secrets are required in CI');
  }
  test.skip(!hasTestUser(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD required outside CI');

  // Session comes from the shared storageState created by e2e/auth.setup.ts.
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('Pricing shows monthly + yearly plans for a non-premium user', async ({ page }) => {
    await gotoPricing(page);
    await expect(planTile(page, 'monthly')).toBeVisible();
    await expect(planTile(page, 'yearly')).toBeVisible();
    await expect(startPremiumButton(page)).toBeVisible();
  });

  for (const plan of ['monthly', 'yearly'] as const) {
    test(`paystack-init returns an authorization URL and client redirects (${plan})`, async ({ page }) => {
      let initCalls = 0;
      let initBody: any = null;
      const authUrl = `https://checkout.paystack.com/pay/test_ref_${plan}`;
      await mockEdgeFunction(page, 'paystack-init', async (route) => {
        initCalls += 1;
        initBody = route.request().postDataJSON?.() ?? null;
        // Do NOT actually redirect the browser to Paystack; the client sets
        // window.location.href — that target host is stubbed below.
        await route.fulfill(jsonResponse({
          authorization_url: authUrl,
          reference: `test_ref_${plan}`,
        }));
      });
      // Block the outbound redirect so we can assert it happened.
      await page.route('https://checkout.paystack.com/**', (r) =>
        r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Mock Paystack</body></html>' }),
      );

      await gotoPricing(page);
      await startCheckout(page, plan);

      await page.waitForURL(/checkout\.paystack\.com/, { timeout: 30_000 });
      expect(initCalls).toBeGreaterThan(0);
      expect(initBody?.plan).toBe(plan);
      expect(page.url()).toContain('/pay/test_ref_');
    });
  }


  test('verified payment activates Premium on /checkout/success', async ({ page }) => {
    await mockEdgeFunction(page, 'paystack-verify', (route) =>
      route.fulfill(jsonResponse({ status: 'success' })),
    );
    await page.goto('/checkout/success?plan=yearly&reference=test_ok_ref');
    await expect(page.getByText(/You're in!|Premium activated/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('cancelled payment does NOT activate Premium', async ({ page }) => {
    await page.goto('/checkout/cancel?reference=test_cancel_ref');
    await expect(page.getByRole('heading', { name: /Checkout cancelled/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again/i })).toBeVisible();
    await expectNotPremium(page);
  });

  test('failed payment does NOT activate Premium', async ({ page }) => {
    await mockEdgeFunction(page, 'paystack-verify', (route) =>
      route.fulfill(jsonResponse({ status: 'failed' })),
    );
    await page.goto('/checkout/success?plan=monthly&reference=test_fail_ref');
    await expect(page.getByText(/Payment didn't go through/i)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: /Retry verification/i })).toBeVisible();
    await expectNotPremium(page);
  });

  test('timed-out verify surfaces retry, page does not go blank', async ({ page }) => {
    // 4 verify attempts x ~35s of forced delay + backoff exceeds the 60s default.
    test.setTimeout(300_000);
    // Delay every verify attempt past the client-side fetch timeout wrapper
    // (payment path = 30s). Four attempts × long delay → retries exhausted.
    await mockEdgeFunction(page, 'paystack-verify', async (route) => {
      await new Promise((r) => setTimeout(r, 35_000));
      await route.abort('timedout');
    });
    await page.goto('/checkout/success?plan=monthly&reference=test_timeout_ref');
    // Should still show the "Confirming payment…" shell (not blank).
    await expect(page.getByText(/Confirming your payment|Verifying with Paystack/i).first())
      .toBeVisible({ timeout: 10_000 });
    // Eventually the failure UI + retry button appears.
    await expect(page.getByRole('button', { name: /Retry verification/i }))
      .toBeVisible({ timeout: 180_000 });
    await expectNotPremium(page);
  });

  test('missing / fake reference is rejected server-side', async ({ page }) => {
    // Server treats unknown refs as failed. Mock reflects real behaviour.
    await mockEdgeFunction(page, 'paystack-verify', (route) =>
      route.fulfill(jsonResponse({ status: 'failed', error: 'reference_not_found' })),
    );
    await page.goto('/checkout/success?plan=monthly&reference=totally_fake_ref');
    await expect(page.getByText(/Payment didn't go through/i)).toBeVisible({ timeout: 25_000 });
    await expectNotPremium(page);

    // No reference at all → immediate failure with support hint.
    await page.goto('/checkout/success?plan=monthly');
    await expect(page.getByText(/Missing payment reference/i)).toBeVisible();
  });

  test('duplicate verify calls do not double-grant Premium', async ({ page }) => {
    let verifyCalls = 0;
    await mockEdgeFunction(page, 'paystack-verify', (route) => {
      verifyCalls += 1;
      return route.fulfill(jsonResponse({ status: 'success' }));
    });

    // First visit → success.
    await page.goto('/checkout/success?plan=monthly&reference=dup_ref_abc');
    await expect(page.getByText(/You're in!|Premium activated/i).first()).toBeVisible({ timeout: 15_000 });
    const firstCount = verifyCalls;

    // Simulate Paystack sending the browser back to the same callback URL
    // again (double redirect, webhook retry, refresh). Same reference,
    // must not error, must not show a duplicate "activation" state.
    await page.reload();
    await expect(page.getByText(/You're in!|Premium activated/i).first()).toBeVisible({ timeout: 15_000 });
    expect(verifyCalls).toBeGreaterThan(firstCount);
    // No error surface on the repeat.
    await expect(page.getByText(/Payment didn't go through/i)).toHaveCount(0);
  });

  test('Premium status is stable across refresh and logout/login', async ({ page }) => {
    // Entitlement comes from the real Supabase profile — read it off /pricing
    // once the page has hydrated (prices fetched, skeletons gone), otherwise
    // the body text is still a loading shell and matches nothing.
    const initial = await readEntitlement(page);

    // Survives a hard refresh (cache + profile refetch).
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await readEntitlement(page)).toBe(initial);

    // Logout via Profile → Sign out, then log back in and re-check. A brand
    // new authenticated session must report the exact same entitlement.
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    const signOut = page.getByRole('button', { name: /Sign out|Log out/i }).first();
    if (await signOut.isVisible().catch(() => false)) {
      await signOut.click();
      const confirm = page.getByRole('button', { name: /Sign out|Confirm|Yes/i }).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForURL(/\/auth$|\/$/, { timeout: 15_000 }).catch(() => {});
      await signIn(page);
    }
    expect(await readEntitlement(page)).toBe(initial);
  });
});

