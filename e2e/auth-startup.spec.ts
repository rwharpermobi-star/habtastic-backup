import { test, expect, type Page } from '@playwright/test';
import { SUPABASE_STORAGE_KEY } from './env';

/**
 * Auth startup / hydration regression suite.
 *
 * The bug class under test: a signed-in user opening or reloading the app sees
 * the public marketing Landing page for a moment before the Dashboard appears.
 * Correct behaviour is always: HabTastic loader -> Dashboard.
 */

const LANDING = '[data-testid="landing-page"]';
const LOADER = '[data-testid="auth-loader"]';
const DASHBOARD = '[data-testid="dashboard-root"]';

/**
 * Watch the DOM from before the app boots and record whether Landing ever
 * became visible, and whether the loader appeared. MutationObserver catches
 * frames that polling would miss.
 */
async function observeStartup(page: Page) {
  await page.addInitScript(
    ({ landing, loader }) => {
      (window as any).__startupProbe = { landingSeen: 0, loaderSeen: 0 };
      const probe = (window as any).__startupProbe;
      const scan = () => {
        if (document.querySelector(landing)) probe.landingSeen += 1;
        if (document.querySelector(loader)) probe.loaderSeen += 1;
      };
      const start = () => {
        scan();
        new MutationObserver(scan).observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      };
      if (document.documentElement) start();
      else document.addEventListener('DOMContentLoaded', start);
    },
    { landing: LANDING, loader: LOADER },
  );
}

async function readProbe(page: Page) {
  return page.evaluate(
    () => (window as any).__startupProbe ?? { landingSeen: 0, loaderSeen: 0 },
  );
}

async function expectNoLandingFlash(page: Page) {
  const probe = await readProbe(page);
  expect(probe.landingSeen, 'Marketing Landing page rendered for a signed-in user').toBe(0);
  const regressions = await page.evaluate(
    () => (window as any).__habtasticLandingFlashCount ?? 0,
  );
  expect(regressions, 'Auth routing regression counter fired').toBe(0);
}

test.describe('authenticated startup', () => {
  test('cold start on / goes loader -> dashboard with no landing flash', async ({ page }) => {
    await observeStartup(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(DASHBOARD)).toBeVisible({ timeout: 45_000 });
    await expectNoLandingFlash(page);
  });

  test('refreshing / keeps the user on the dashboard', async ({ page }) => {
    await observeStartup(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(DASHBOARD)).toBeVisible({ timeout: 45_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(DASHBOARD)).toBeVisible({ timeout: 45_000 });
    await expectNoLandingFlash(page);
  });

  test('refreshing a protected route reloads that route, not landing', async ({ page }) => {
    await observeStartup(page);
    await page.goto('/habits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe('/habits');
    await expectNoLandingFlash(page);
  });

  test('slow session restoration shows the loader, never landing', async ({ page }) => {
    // Deliberately delayed auth endpoints + a 60s dashboard wait need more than
    // the 60s default test budget. Waiting is on real app state, not sleeps.
    test.setTimeout(150_000);
    // Delay the Supabase auth endpoints so hydration takes ~2.5s.

    await page.route(/\/auth\/v1\/(user|token)/, async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.continue();
    });
    await observeStartup(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(LOADER)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(LANDING)).toHaveCount(0);
    await expect(page.locator(DASHBOARD)).toBeVisible({ timeout: 60_000 });
    await expectNoLandingFlash(page);
  });

  test('direct protected-route navigation never renders landing', async ({ page }) => {
    await observeStartup(page);
    await page.goto('/progress', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe('/progress');
    await expectNoLandingFlash(page);
  });

  test('/auth redirects a signed-in user into the app', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .not.toBe('/auth');
  });
});

test.describe('unauthenticated startup', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signed-out visitor reaches the landing page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(LANDING)).toBeVisible({ timeout: 45_000 });
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('expired session falls back to the public entry, no dashboard', async ({ page }) => {
    const expired = JSON.stringify({
      access_token: 'expired.expired.expired',
      refresh_token: 'expired',
      token_type: 'bearer',
      expires_in: 0,
      expires_at: Math.floor(Date.now() / 1000) - 3_600,
      user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated' },
    });
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: SUPABASE_STORAGE_KEY, value: expired },
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(DASHBOARD)).toHaveCount(0);
    await expect(page.locator(LANDING)).toBeVisible({ timeout: 45_000 });
  });
});
