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
 * Nutzt Playwrights GEBÜNDELTES Chromium, NICHT das systeminstallierte Chrome
 * (`channel: 'chrome'`, bis 2026-07-31). Grund: System-Chrome startet auf macOS
 * GoogleUpdater/chrome_crashpad_handler, die Playwrights stdout/stderr-
 * Socketpair erben, zu launchd reparenten und nie schließen — der Worker bekam
 * kein EOF und hing bis zum 300-s-Force-Kill (Exit 1 trotz grüner Suite).
 * Preis: `npx playwright install chromium` einmalig (~120 MB), in CI ein
 * eigener Install-Schritt. Läuft gegen einen bereits laufenden Dev-Server
 * (reuseExistingServer) oder startet ihn selbst.
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
  // Playwrights Standard sind 30 s pro Test. Die Suite fährt aber gegen den
  // DEV-Server (webServer unten, in CI genauso), und der kompiliert jede Route
  // beim ERSTEN Zugriff — kalt gemessen: `/` gut 25 s, `/embed` samt
  // Client-Bundle über 30 s. Mit 30 s Budget scheiterte deshalb nicht der
  // Testgegenstand, sondern der Kaltstart, und der Bericht zeigte auf eine
  // beliebige Wartezeile. 90 s trennt „Server baut noch" von „Sache kaputt";
  // die inneren Erwartungen bleiben eng, die fangen echte Regressionen.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI ZUSÄTZLICH 'list': der github-Reporter meldet nur „N skipped" als
  // Zahl — welcher Fall verschwunden ist, stand nirgends. Ein übersprungener
  // Test muss im Job-Log beim Namen genannt werden, sonst kann eine Suite
  // still leerlaufen, ohne dass der grüne Haken lügt.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [
    // Kein `channel` ⇒ Playwrights gebündeltes Chromium (siehe Kopfkommentar).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    /**
     * Schaltet die Nuxt DevTools ab (nuxt.config liest `PW_E2E`) — ihr
     * Abzeichen trägt eine wechselnde ms-Zahl und saß sonst mitten in den
     * Theme-Baselines.
     *
     * ACHTUNG bei `reuseExistingServer`: läuft schon ein Dev-Server, gilt
     * DESSEN Umgebung. Zum Neubacken der Baselines den Server deshalb selbst
     * mit dem Schalter starten:
     *   PW_E2E=1 pnpm --filter comments dev
     * Der Visual-Test prüft das und schlägt sonst mit klarer Ansage fehl.
     */
    env: { PW_E2E: '1' },
  },
})
