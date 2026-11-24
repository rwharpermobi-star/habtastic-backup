import { expect, type Page, type Route } from '@playwright/test';
import {
  TEST_EMAIL,
  TEST_PASSWORD,
  SUPABASE_STORAGE_KEY,
  logAuthDiagnostics,
} from './env';

export { TEST_EMAIL, TEST_PASSWORD };

export const hasTestUser = () => Boolean(TEST_EMAIL && TEST_PASSWORD);


/**
 * Sign in through the real Auth UI so the AuthContext + Supabase session
 * are hydrated exactly as they are in production. Waits for the Supabase
 * auth token to land in localStorage — the auth form disappearing alone is
 * not proof the session is usable on the next navigation.
 */
export async function signIn(page: Page) {
  if (!hasTestUser()) {
    logAuthDiagnostics('[e2e auth failure]');
    throw new Error('E2E_EMAIL / E2E_PASSWORD (or TEST_USER_EMAIL / TEST_USER_PASSWORD) not set');
  }
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[e2e browser ${message.type()}] ${message.text()}`);
    }
  });
  // `/` is the public marketing Landing page — the login form lives on /auth.
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  const email = page.getByTestId('auth-email');

  const hasForm = await email
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => true)
    .catch(() => false);

  if (hasForm) {
    const authResponsePromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/auth/v1/token') && url.includes('grant_type=password');
      },
      { timeout: 45_000 },
    );
    await email.fill(TEST_EMAIL);
    await page.getByTestId('auth-password').fill(TEST_PASSWORD);
    await page.getByTestId('auth-submit').click({ force: true });
    const authResponse = await authResponsePromise;
    console.log(
      `[e2e auth] request=${new URL(authResponse.url()).pathname} status=${authResponse.status()}`,
    );
    if (!authResponse.ok()) {
      await page.waitForTimeout(500);
      const visibleError = await page.locator('[role="alert"]:visible').allTextContents().catch(() => []);
      logAuthDiagnostics('[e2e auth failure]');
      throw new Error(
        `Supabase password login failed with HTTP ${authResponse.status()}; visible error: ${visibleError.join(' | ') || 'none'}`,
      );
    }
    await expect(email).toHaveCount(0, { timeout: 45_000 });
  } else {
    // No form and no session for *this* project means auth never rendered —
    // fail loudly instead of timing out later on an empty localStorage.
    const alreadySignedIn = await page.evaluate(
      (key) => Boolean(window.localStorage.getItem(key)),
      SUPABASE_STORAGE_KEY,
    );
    if (!alreadySignedIn) {
      logAuthDiagnostics('[e2e auth failure]');
      throw new Error(`Login form never rendered on ${page.url()} and no Supabase session exists`);
    }
  }

  // Scoped to the current project ref only — sessions from old/deleted
  // Supabase projects are never treated as valid.
  await expect
    .poll(
      () => page.evaluate((key) => Boolean(window.localStorage.getItem(key)), SUPABASE_STORAGE_KEY),
      {
        timeout: 30_000,
        message: `Supabase session never reached localStorage under ${SUPABASE_STORAGE_KEY}`,
      },
    )
    .toBe(true);

  const { data, error } = await page.evaluate((key) => {
    try {
      const session = JSON.parse(window.localStorage.getItem(key) ?? 'null');
      return {
        data: {
          hasAccessToken: Boolean(session?.access_token),
          hasUser: Boolean(session?.user?.id),
          expiresAt: Number(session?.expires_at ?? 0),
        },
        error: null as string | null,
      };
    } catch {
      return { data: null, error: 'invalid session JSON' };
    }
  }, SUPABASE_STORAGE_KEY);
  expect(error, 'Stored Supabase session could not be read').toBeNull();
  expect(data?.hasAccessToken, 'Stored Supabase access token missing').toBe(true);
  expect(data?.hasUser, 'Stored Supabase user missing').toBe(true);
  expect(data?.expiresAt ?? 0, 'Stored Supabase session expired').toBeGreaterThan(Math.floor(Date.now() / 1000));

}



type Handler = (route: Route) => Promise<void> | void;

/**
 * Intercept Supabase Edge Function calls by name. The Supabase client posts
 * to `/functions/v1/<name>` on the project URL — matching on the path suffix
 * keeps the helper stable across environments.
 */
export async function mockEdgeFunction(page: Page, name: string, handler: Handler) {
  const pattern = new RegExp(`/functions/v1/${name}(\\?|$)`);
  await page.route(pattern, async (route) => {
    await handler(route);
  });
}

export const jsonResponse = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Assert the app never claims Premium is active. */
export async function expectNotPremium(page: Page) {
  await expect(page.getByText(/Premium activated/i)).toHaveCount(0);
  await expect(page.getByText(/You're in!/i)).toHaveCount(0);
}

export type Plan = 'monthly' | 'yearly';

/**
 * The "Start Premium" checkout CTA. Pricing renders up to three of these
 * (hero, plan-picker, footer) and their labels embed the live localised
 * price, so match on the stable data-testid prefix instead of text.
 */
export function startPremiumButton(page: Page) {
  return page.locator('[data-testid^="start-premium-cta"]').first();
}

/** Stable plan-selector tiles (hero grid + plan section). */
export function planTile(page: Page, plan: Plan) {
  return page.locator(`[data-testid^="start-premium-${plan}"]`).first();
}

/**
 * Wait until the pricing page has hydrated (prices fetched, skeletons gone)
 * and the checkout CTA is visible + enabled.
 */
export async function gotoPricing(page: Page) {
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  // Plan tiles only render once usePricingPlans resolved (skeletons gone).
  await expect(planTile(page, 'monthly')).toBeVisible({ timeout: 45_000 });
  await expect(planTile(page, 'yearly')).toBeVisible({ timeout: 45_000 });
  const cta = startPremiumButton(page);
  await expect(cta).toBeVisible({ timeout: 45_000 });
  await expect(cta).toBeEnabled({ timeout: 45_000 });
}

/**
 * Select a plan, then open checkout through the confirm modal.
 * The Pricing CTAs animate on an infinite framer-motion loop (JS transforms,
 * so `reducedMotion` / CSS overrides don't stop them). We assert visible +
 * enabled explicitly, then force the click to skip the stability wait.
 */
export async function startCheckout(page: Page, plan: Plan) {
  const tile = planTile(page, plan);
  await expect(tile).toBeVisible();
  await tile.click({ force: true });

  const cta = startPremiumButton(page);
  await expect(cta).toBeVisible();
  await expect(cta).toBeEnabled();
  await cta.click({ force: true });

  const confirm = page.getByTestId('upgrade-confirm');
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await expect(confirm).toBeEnabled();
  await confirm.click({ force: true });
}



export type Entitlement = 'premium' | 'free';

/**
 * Read the entitlement the app derives from the real Supabase profile off the
 * hydrated /pricing page. Premium subscribers see their active plan
 * ("Monthly Plan" / "Yearly Plan"); everyone else sees the "Start Premium" CTA.
 *
 * Polls until the page has hydrated — reading body text straight after a
 * navigation/reload catches the loading shell and matches neither branch.
 */
export async function readEntitlement(page: Page): Promise<Entitlement> {
  await gotoPricing(page);
  let result: Entitlement | null = null;
  await expect
    .poll(
      async () => {
        const text = await page.locator('body').innerText();
        if (/(Monthly Plan|Yearly Plan)/.test(text)) result = 'premium';
        else if (/Start Premium/.test(text)) result = 'free';
        else result = null;
        return result;
      },
      {
        timeout: 30_000,
        message: 'Pricing page never reported a Premium or Free entitlement',
      },
    )
    .not.toBeNull();
  return result!;
}
