import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/unsubscribe',
  '/refunds',
  '/refund-policy',
  '/cancellation',
  '/delete-account',
  '/contact',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-of-service',
  '/pricing',
  '/health',
] as const;

test.describe('Public route contract', () => {
  for (const route of ROUTES) {
    test(`${route} renders without broken layout or same-origin failures`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('requestfailed', (request) => {
        if (new URL(request.url()).origin === new URL(page.url() || 'http://localhost').origin) {
          failedRequests.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();

      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        nestedControls: document.querySelectorAll('a button, button a').length,
        brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
      }));

      expect(layout.scrollWidth, 'page must not overflow horizontally').toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.nestedControls, 'links and buttons must not be nested').toBe(0);
      expect(layout.brokenImages, 'all loaded images must decode').toBe(0);
      expect(failedRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('direct invalid-token routes explain the recovery path', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Invalid Reset Link' })).toBeVisible();

    await page.goto('/unsubscribe');
    await expect(page.getByRole('heading', { name: 'Invalid link' })).toBeVisible();
  });
});
