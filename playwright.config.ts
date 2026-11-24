import { defineConfig, devices } from '@playwright/test';

// Playwright config for HabTastic AI E2E.
// Vitest still owns unit tests under src/. Playwright tests live under e2e/;
// the testDir + testMatch filter below keeps the two runners strictly separate.
const PORT = Number(process.env.E2E_PORT ?? 8080);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.(spec|setup)\.ts/,
  // Fails fast with safe diagnostics when credentials / Supabase env are missing.
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,
  retries: isCI ? 2 : 0,
  workers: 1,
  // CI also emits a machine-readable JSON summary so the workflow can print the
  // failing tests (and their trace/video paths) straight into the run summary.
  // Report/output locations are overridable per step via PLAYWRIGHT_HTML_REPORT /
  // PLAYWRIGHT_JSON_OUTPUT_NAME so the auth-setup run cannot clobber the main run.
  reporter: isCI
    ? [
        ['html', { open: 'never', outputFolder: process.env.PLAYWRIGHT_HTML_REPORT ?? 'playwright-report' }],
        ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'playwright-results.json' }],
        ['github'],
        ['list'],
      ]
    : [['html', { open: 'never' }], ['list']],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
    // Pricing CTAs pulse forever; reduced motion keeps them click-stable.
    reducedMotion: 'reduce',
    // Optional escape hatch for sandboxes/containers that ship their own
    // Chromium instead of the Playwright-managed download. Unset in CI.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /(pricing-public|public-routes|background-audio)\.spec\.ts|auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
    // Public pages / API policy checks need no session.
    {
      name: 'public',
      testMatch: /(pricing-public|public-routes)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public-mobile',
      testMatch: /public-routes\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    // Background music: web build.
    {
      name: 'audio-web',
      testMatch: /background-audio\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
      dependencies: ['setup'],
    },
    // Background music: Android Chromium WebView (what Capacitor renders the APK in).
    {
      name: 'audio-android',
      testMatch: /background-audio\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
      dependencies: ['setup'],
    },

  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});


