import { expect, test } from '@playwright/test'

/**
 * Smoke-Tests für die Portfolio-Landing: SSR-Render, i18n, SEO-Head, 404.
 * Komplett auth-frei — die Site hat keinen öffentlichen Login-Flow.
 */

test.describe('Landing', () => {
  test('rendert Hero + Cases (englisch, Default ohne Prefix)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/David Schubert/i)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('heading', { name: /cases/i })).toBeVisible()
  })

  test('liefert hreflang-Alternates + canonical (useLocaleHead)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  })

  test('rendert ohne schwerwiegende Konsolen-Fehler', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (/Failed to load resource|WebSocket|Hydration completed/i.test(text)) return
      errors.push(text)
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('i18n', () => {
  // Deutscher Browser: detectBrowserLanguage (redirectOn: 'all') hält /de.
  test.use({ locale: 'de-DE' })

  test('/de rendert die deutsche Variante (html lang)', async ({ page }) => {
    await page.goto('/de')
    await expect(page.locator('html')).toHaveAttribute('lang', /de/)
    await expect(page.locator('h1')).toBeVisible()
  })
})

test.describe('Fehlerseiten', () => {
  test('unbekannte Route liefert 404', async ({ page }) => {
    const response = await page.goto('/gibt-es-nicht')
    expect(response?.status()).toBe(404)
  })
})
