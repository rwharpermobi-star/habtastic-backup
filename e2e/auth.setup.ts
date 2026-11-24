import { test as setup, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
  assertSupabaseTestEnv,
  assertTestCredentials,
  logAuthDiagnostics,
} from './env';

/** Shared authenticated storage state consumed by every authenticated project. */
export const STORAGE_STATE = 'playwright/.auth/user.json';

const isPasswordTokenResponse = (url: string) =>
  url.includes('/auth/v1/token') && url.includes('grant_type=password');

/** Collect any visible inline/toast error text on the login screen. */
async function readVisibleError(page: Page): Promise<string> {
  const texts = await page
    .locator('[role="alert"]:visible, [data-sonner-toast]:visible')
    .allTextContents()
    .catch(() => [] as string[]);
  return texts.map((t) => t.trim()).filter(Boolean).join(' | ');
}

/**
 * Validate the captured session with the real Supabase client — the same
 * `supabase.auth.getSession()` call the app relies on. Nothing here trusts a
 * stale localStorage key from a previous/deleted project: the key is scoped to
 * the expected project ref and the session is re-read through the SDK.
 */
function clientFromSession(rawSession: string) {
  const memory = new Map<string, string>([[SUPABASE_STORAGE_KEY, rawSession]]);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey: SUPABASE_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => memory.get(key) ?? null,
        setItem: (key, value) => void memory.set(key, value),
        removeItem: (key) => void memory.delete(key),
      },
    },
  });
}

async function assertSessionUsable(rawSession: string) {
  const client = clientFromSession(rawSession);

  const { data, error } = await client.auth.getSession();
  expect(error?.message ?? null, 'supabase.auth.getSession() returned an error').toBeNull();
  expect(data.session?.access_token, 'getSession() produced no access token').toBeTruthy();
  expect(data.session?.user?.id, 'getSession() produced no user').toBeTruthy();
  expect(
    data.session?.expires_at ?? 0,
    'getSession() returned an expired session',
  ).toBeGreaterThan(Math.floor(Date.now() / 1000));
}

/**
 * A brand-new test account starts with `onboarding_complete = false`, so the
 * app (correctly) routes every authenticated path to the Onboarding wizard —
 * no Dashboard, no /pricing, no /checkout/*. Mark onboarding as done for the
 * test user with its own session (RLS: users may update their own profile),
 * exactly like finishing the wizard does. Idempotent and scoped to the test
 * account only — no production logic is changed or bypassed.
 */
async function ensureOnboardingComplete(rawSession: string) {
  const client = clientFromSession(rawSession);
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user?.id;
  expect(userId, 'no user id on the captured session').toBeTruthy();

  const { data: profile, error: readError } = await client
    .from('profiles')
    .select('onboarding_complete')
    .eq('user_id', userId!)
    .maybeSingle();
  expect(readError?.message ?? null, 'could not read the test user profile').toBeNull();

  if (profile?.onboarding_complete) {
    console.log('[e2e auth] onboarding already complete for the test user');
    return;
  }

  const { error: updateError } = await client
    .from('profiles')
    .update({ onboarding_complete: true })
    .eq('user_id', userId!);
  expect(updateError?.message ?? null, 'could not complete onboarding for the test user').toBeNull();
  console.log('[e2e auth] marked onboarding complete for the test user');
}

/**
 * Proof that the saved storage state actually lands on the app shell: `/`
 * must render the Dashboard (never the Onboarding wizard or Landing page).
 * Fails here — in setup — instead of inside every downstream spec.
 */
async function assertDashboardReachable(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByTestId('dashboard-root'),
    'Signed-in user did not reach the Dashboard (onboarding gate or landing page rendered instead)',
  ).toBeVisible({ timeout: 60_000 });
}


/**
 * Logs in once through the real login form and persists the Supabase session.
 * Every spec reuses this storage state, so we never hammer Supabase Auth.
 */
setup('authenticate', async ({ page }) => {
  // Login + session validation + first Dashboard paint can exceed the 60s default.
  setup.setTimeout(180_000);
  logAuthDiagnostics();

  assertSupabaseTestEnv();
  assertTestCredentials();
  console.log('[e2e auth] target Supabase project host:', new URL(SUPABASE_URL).host);

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[e2e browser ${message.type()}] ${message.text()}`);
    }
  });

  let tokenStatus: number | null = null;
  let tokenBody = '';
  page.on('response', async (response) => {
    if (!isPasswordTokenResponse(response.url())) return;
    tokenStatus = response.status();
    console.log(`[e2e auth] Supabase password response: ${tokenStatus}`);
    if (!response.ok()) {
      tokenBody = await response.text().catch(() => '');
      if (tokenBody) console.log(`[e2e auth] Supabase error body: ${tokenBody}`);
    }
  });

  try {
  // Login page. If an authenticated session already exists,
  // HabTastic redirects /auth -> /app.
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });

  if (new URL(page.url()).pathname === '/app') {
    console.log('[e2e auth] Existing authenticated session detected');

    const rawSession = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SUPABASE_STORAGE_KEY,
    );

    expect(
      rawSession,
      'Redirected to /app but no Supabase session exists',
    ).toBeTruthy();

    await assertSessionUsable(rawSession as string);
    await ensureOnboardingComplete(rawSession as string);
    await assertDashboardReachable(page);

    await page.context().storageState({ path: STORAGE_STATE });


    console.log(
      '[e2e auth] Reused existing authenticated session and saved storage state',
    );

    return;
  }

  const email = page.getByTestId('auth-email');
  const password = page.getByTestId('auth-password');
  const submit = page.getByTestId('auth-submit');

  await expect(
    email,
    'Login form never rendered on /auth',
  ).toBeVisible({ timeout: 45_000 });

  await expect(password).toBeVisible({ timeout: 15_000 });

    // Fill via real typing so React state (and any validation) updates.
    await email.click();
    await email.fill(TEST_EMAIL);
    await password.click();
    await password.fill(TEST_PASSWORD);
    await expect(email).toHaveValue(TEST_EMAIL);
    await expect(password).toHaveValue(TEST_PASSWORD);

    await expect(submit, 'Login button is disabled').toBeEnabled({ timeout: 15_000 });

    const tokenResponse = page
      .waitForResponse((response) => isPasswordTokenResponse(response.url()), { timeout: 45_000 })
      .catch(() => null);
    const visibleErrorAppeared = page
      .locator('[role="alert"]:visible, [data-sonner-toast]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => 'error' as const)
      .catch(() => null);

    await submit.click();

    // Whichever happens first: the Supabase token call or a visible login error.
    const outcome = await Promise.race([
      tokenResponse.then((response) => (response ? ('token' as const) : null)),
      visibleErrorAppeared,
    ]);

    if (outcome === 'error' && tokenStatus === null) {
      const visibleError = await readVisibleError(page);
      throw new Error(
        `Login failed before any Supabase request. Visible error: ${visibleError || 'none'}`,
      );
    }

    const response = await tokenResponse;
    expect(
      response,
      'The login form submission never triggered POST /auth/v1/token?grant_type=password',
    ).not.toBeNull();

    if (response && !response.ok()) {
      const visibleError = await readVisibleError(page);
      throw new Error(
        `Supabase password login failed with HTTP ${response.status()}. Body: ${
          tokenBody || '(empty)'
        }. Visible error: ${visibleError || 'none'}`,
      );
    }

    console.log('[e2e auth] current page URL:', page.url());

    await expect(email).toHaveCount(0, { timeout: 30_000 });
    expect(new URL(page.url()).pathname, 'Browser remained on the login page').not.toBe('/auth');

    // Only the storage key for the *current* project is acceptable.
    await expect
      .poll(
        () => page.evaluate((key) => Boolean(window.localStorage.getItem(key)), SUPABASE_STORAGE_KEY),
        {
          timeout: 30_000,
          message: `Supabase session never reached localStorage under ${SUPABASE_STORAGE_KEY}`,
        },
      )
      .toBe(true);

    const rawSession = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SUPABASE_STORAGE_KEY,
    );
    expect(rawSession, 'Stored Supabase session is empty').toBeTruthy();

    // Verify through the SDK: await supabase.auth.getSession().
    await assertSessionUsable(rawSession as string);
    await ensureOnboardingComplete(rawSession as string);

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('auth-email')).toHaveCount(0, { timeout: 15_000 });
    expect(new URL(page.url()).pathname, 'Authenticated navigation returned to login').not.toBe('/auth');
    await assertDashboardReachable(page);


    await page.context().storageState({ path: STORAGE_STATE });
    console.log('[e2e auth] saved authenticated storage state to', STORAGE_STATE);
  } catch (error) {
    const visibleError = await readVisibleError(page);
    console.error('[e2e auth] current page URL:', page.url());
    console.error('[e2e auth] visible login error:', visibleError || 'none');
    console.error('[e2e auth] Supabase authentication response status:', tokenStatus ?? 'not observed');
    if (tokenBody) console.error('[e2e auth] Supabase error body:', tokenBody);
    logAuthDiagnostics('[e2e auth failure]');
    await page.screenshot({ path: 'test-results/auth-setup-failure.png' }).catch(() => {});
    throw error;
  }
});
