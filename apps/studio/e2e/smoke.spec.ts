import { expect, test } from '@playwright/test'

/**
 * Auth-freie Smoke-Tests fürs Studio: Routing, SSR-Render, i18n, Auth-Guards
 * und die öffentlichen Rechtsseiten (pages-Layer). Kein Appwrite-Login —
 * eingeloggte Flows (Dashboard, Workspaces) werden manuell verifiziert.
 */

test.describe('Login & Auth-Guards', () => {
  test('Login-Seite rendert (englisch, Default ohne Prefix)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder(/you@example|du@example/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|log in|anmelden/i })).toBeVisible()
  })

  test('Dashboard unauthentifiziert → Redirect zum Login', async ({ page }) => {
    await page.goto('/dashboard/pages')
    await page.waitForURL(/\/login/)
    await expect(page).toHaveURL(/\/login/)
  })

  test('Login rendert ohne schwerwiegende Konsolen-Fehler', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      // Bekanntes Rauschen ausklammern (HMR/Netz), nur echte App-Fehler zählen.
      if (/Failed to load resource|WebSocket|Hydration completed/i.test(text)) return
      errors.push(text)
    })
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('Öffentliche Rechtsseiten (pages-Layer)', () => {
  // Datenabhängig: die Demo-Seiten kommen aus seed-demo.mjs. Auf einer
  // ungeseedeten Instanz skippen statt rot werden (env-gated wie Realtime).
  test.beforeEach(async ({ request }) => {
    const probe = await request.get('/api/pages/public/imprint')
    test.skip(probe.status() === 404, 'pages nicht geseedet (seed-demo.mjs) — übersprungen')
  })

  for (const slug of ['imprint', 'terms', 'privacy']) {
    test(`/${slug} rendert öffentlich (SSR, ohne Login)`, async ({ page }) => {
      await page.goto(`/${slug}`)
      await expect(page.locator('article h1')).toBeVisible()
    })
  }

  test('/de/imprint rendert die deutsche Sprachversion', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()
    await page.goto('/de/imprint')
    await expect(page.locator('html')).toHaveAttribute('lang', /de/)
    await context.close()
  })

  test('Footer verlinkt die Rechtsseiten (config-gated legalLinks)', async ({ page }) => {
    await page.goto('/imprint')
    const footer = page.locator('footer')
    await expect(footer.getByRole('link', { name: /imprint|impressum/i })).toBeVisible()
    await expect(footer.getByRole('link', { name: /terms|agb/i })).toBeVisible()
    await expect(footer.getByRole('link', { name: /privacy|datenschutz/i })).toBeVisible()
  })

  test('unbekannter Slug liefert 404 (nur published wird ausgeliefert)', async ({ request }) => {
    const response = await request.get('/api/pages/public/does-not-exist')
    expect(response.status()).toBe(404)
  })
})

test.describe('Admin-API-Guards', () => {
  test('Admin-Pages-API ohne Session → 401', async ({ request }) => {
    const response = await request.get('/api/pages')
    expect(response.status()).toBe(401)
  })
})
