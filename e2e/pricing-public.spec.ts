import { test, expect } from '@playwright/test';
import { planTile, startPremiumButton } from './helpers';

/**
 * Public /pricing view — no auth required. Sanity check that both plans
 * render with prices so the paywall wiring can't silently drift.
 * Uses stable data-testids, not copy that changes with localisation.
 */
test.describe('Pricing (public)', () => {
  test('shows monthly and yearly plans with prices', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    const monthly = planTile(page, 'monthly');
    const yearly = planTile(page, 'yearly');
    await expect(monthly).toBeVisible({ timeout: 45_000 });
    await expect(yearly).toBeVisible({ timeout: 45_000 });

    // ZAR pricing from the PLANS catalogue (R94.99 / R899.99).
    await expect(monthly).toContainText(/R\s?94\.99/);
    await expect(yearly).toContainText(/R\s?899\.99/);

    const cta = startPremiumButton(page);
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
  });

  test('selecting a plan updates the checkout CTA', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(planTile(page, 'monthly')).toBeVisible({ timeout: 45_000 });

    await planTile(page, 'monthly').click();
    await expect(startPremiumButton(page)).toContainText(/R\s?94\.99/);

    await planTile(page, 'yearly').click();
    await expect(startPremiumButton(page)).toContainText(/R\s?899\.99/);
  });
});
