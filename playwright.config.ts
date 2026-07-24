import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = `http://localhost:${PORT}`

/**
 * Hermetic E2E config. The app is built with `--mode test` so the bundle points
 * at the stub Supabase host from .env.test; every request to it is intercepted
 * by e2e/fixtures/supabase.ts, so the tests need no secrets and no network.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Optional override for sandboxed environments that ship a pre-installed
    // Chromium whose build differs from the one @playwright/test expects. Unset
    // in CI, where `playwright install chromium` provides the matching browser.
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `npm run build -- --mode test` appends the flag to the end of the script,
    // i.e. `tsc -b && vite build --mode test`, so .env.test is baked in.
    command: 'npm run build -- --mode test && npm run preview -- --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
