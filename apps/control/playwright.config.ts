import { defineConfig, devices } from '@playwright/test'

/**
 * E2E-Smoke-Tests für studio (Port 3004) — Muster von apps/comments.
 *
 * Nutzt das systeminstallierte Google Chrome (channel: 'chrome') — kein
 * Playwright-Browser-Download nötig. Läuft gegen einen bereits laufenden Dev-
 * Server (reuseExistingServer) oder startet ihn selbst.
 *
 * Bewusst auth-frei: Routing, SSR-Render, i18n, Auth-Guards und die
 * öffentlichen Rechtsseiten (pages-Layer) — ohne Appwrite-Credentials.
 * Eingeloggte Flows (Dashboard, Workspaces) werden manuell verifiziert.
 */
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:3004'

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
