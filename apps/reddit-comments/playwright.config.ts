import { defineConfig, devices } from '@playwright/test'

/**
 * E2E-Smoke-Tests für reddit-comments (Port 3001).
 *
 * Nutzt das systeminstallierte Google Chrome (channel: 'chrome') — kein
 * Playwright-Browser-Download nötig. Läuft gegen einen bereits laufenden Dev-
 * Server (reuseExistingServer) oder startet ihn selbst.
 *
 * Bewusst auth-frei: die Tests decken Routing, SSR-Render, i18n und die
 * öffentlichen Seiten ab — ohne Appwrite-Credentials, damit sie portabel/CI-
 * tauglich sind. Realtime/eingeloggte Flows werden manuell verifiziert.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3001',
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
