import { test, expect } from '@playwright/test'

/**
 * Visuelle Regression pro Built-in-Theme: Screenshot der deterministischen
 * /visual-Seite gegen die eingecheckte Baseline. Fängt Theme-Bugs (kaputte
 * Ramps, CSS-Variablen, Component-Styling), die man sonst nur manuell in 9
 * Themes sähe. Zielseite ist BEWUSST nicht die Startseite: deren Live-Daten
 * (Demo-Kommentare, Presence, Zähler) rissen bei jeder Datenänderung alle
 * Baselines (Content-Drift, 2026-07-09) — /visual rendert dieselben
 * Bausteine mit festen Werten und leerem Kommentar-Thread.
 *
 * Baselines aktualisieren (nach GEWOLLTEN Änderungen):
 *   pnpm --filter comments e2e -- --update-snapshots themes-visual
 *
 * Deterministik: Light-Mode erzwungen, Animationen/Übergänge abgeschaltet.
 * CI-Skip: Baselines sind Plattform-spezifisch (-darwin) — bis die CI eigene
 * Linux-Baselines pflegt, laufen die Tests nur lokal.
 */
const THEMES = ['default', 'ocean', 'forest', 'sunset', 'midnight', 'berry', 'crimson', 'citrus', 'graphite']

test.describe('Themes: visuelle Regression (Startseite)', () => {
  test.skip(!!process.env.CI, 'Plattform-spezifische Baselines — nur lokal (s. Kommentar).')

  for (const theme of THEMES) {
    test(`/visual rendert Theme '${theme}' unverändert`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'maui-theme', value: theme, url: baseURL! }])
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.addInitScript(() => localStorage.setItem('nuxt-color-mode', 'light'))

      await page.goto('/visual')
      await page.waitForLoadState('networkidle')
      // Animationen/Caret einfrieren — sonst flackern Diffs
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' })

      await expect(page).toHaveScreenshot(`visual-${theme}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      })
    })
  }
})
