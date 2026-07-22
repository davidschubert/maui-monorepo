import { defineConfig, devices } from '@playwright/test'

/**
 * E2E-Smoke-Tests für portfolio (Port 3005) — Muster von apps/comments.
 * Auth-frei: die Site ist eine öffentliche Landing (kein Login-Flow nötig).
 */
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:3005'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
