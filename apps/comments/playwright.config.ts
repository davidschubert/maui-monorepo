import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// .env (Appwrite-Runtime-Key etc.) für die Tests bereitstellen — nur Keys setzen,
// die noch nicht in der Umgebung stehen. Fehlt die Datei (z. B. CI), überspringt
// der Realtime-Test sich selbst (env-gated). Keine externe dotenv-Abhängigkeit.
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]!
    if (process.env[key] === undefined) process.env[key] = m[2]!.replace(/^["']|["']$/g, '')
  }
}
catch { /* keine .env → env-gated Tests skippen */ }

/**
 * E2E-Smoke-Tests für comments (Port 3001).
 *
 * Nutzt das systeminstallierte Google Chrome (channel: 'chrome') — kein
 * Playwright-Browser-Download nötig. Läuft gegen einen bereits laufenden Dev-
 * Server (reuseExistingServer) oder startet ihn selbst.
 *
 * Bewusst auth-frei: die Tests decken Routing, SSR-Render, i18n und die
 * öffentlichen Seiten ab — ohne Appwrite-Credentials, damit sie portabel/CI-
 * tauglich sind. Realtime/eingeloggte Flows werden manuell verifiziert.
 */
// Base-URL überschreibbar (PW_BASE_URL) — z. B. um gegen einen bereits
// laufenden Dev-Server auf einem anderen Port zu testen (parallele Sessions).
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:3001'

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
