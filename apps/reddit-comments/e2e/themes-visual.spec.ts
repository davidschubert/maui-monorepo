import { test, expect } from '@playwright/test'

/**
 * Visuelle Regression pro Built-in-Theme: Screenshot des Styleguides gegen
 * die eingecheckte Baseline. Fängt Theme-Bugs (kaputte Ramps, CSS-Variablen,
 * Component-Styling), die man sonst nur manuell in 9 Themes sähe.
 *
 * Baselines aktualisieren (nach GEWOLLTEN Änderungen):
 *   pnpm --filter reddit-comments e2e -- --update-snapshots themes-visual
 *
 * Deterministik: Light-Mode erzwungen, Animationen/Übergänge abgeschaltet.
 * CI-Skip: Baselines sind Plattform-spezifisch (-darwin) — bis die CI eigene
 * Linux-Baselines pflegt, laufen die Tests nur lokal.
 */
const THEMES = ['default', 'ocean', 'forest', 'sunset', 'midnight', 'berry', 'crimson', 'citrus', 'graphite']

test.describe('Themes: visuelle Regression (Styleguide)', () => {
  test.skip(!!process.env.CI, 'Plattform-spezifische Baselines — nur lokal (s. Kommentar).')

  for (const theme of THEMES) {
    test(`Styleguide rendert Theme '${theme}' unverändert`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'maui-theme', value: theme, url: baseURL! }])
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.addInitScript(() => localStorage.setItem('nuxt-color-mode', 'light'))

      await page.goto('/styleguide')
      await page.waitForLoadState('networkidle')
      // Animationen/Caret einfrieren — sonst flackern Diffs
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' })

      await expect(page).toHaveScreenshot(`styleguide-${theme}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      })
    })
  }
})
