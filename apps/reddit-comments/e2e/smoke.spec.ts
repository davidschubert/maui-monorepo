import { test, expect } from '@playwright/test'

/**
 * Auth-freie Smoke-Tests: Routing, SSR-Render, i18n und öffentliche Seiten.
 * Kein Appwrite-Login (passwortbasiert) — Realtime/eingeloggte Flows werden
 * manuell verifiziert.
 */

test.describe('Startseite', () => {
  test('lädt (englisch, Default ohne Prefix) mit Titel + Kommentarbereich', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Discuss like on Reddit/i)
    // Kommentar-Sektion serverseitig gerendert
    await expect(page.locator('[data-comment-section]')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Comments/i })).toBeVisible()
  })

  test('rendert ohne schwerwiegende Konsolen-Fehler', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      // Bekanntes Rauschen ausklammern (HMR/Netz), nur echte App-Fehler zählen.
      if (/Failed to load resource|WebSocket|Hydration completed/i.test(text)) return
      errors.push(text)
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('i18n', () => {
  // Deutscher Browser: detectBrowserLanguage (redirectOn: 'all') hält /de dann,
  // statt einen englischen Browser auf den prefix-losen Default umzuleiten.
  test.use({ locale: 'de-DE' })

  test('/de rendert die deutsche Variante', async ({ page }) => {
    await page.goto('/de')
    await expect(page).toHaveTitle(/Diskutiere wie auf Reddit/i)
  })
})

test.describe('Öffentliches Changelog', () => {
  test('zeigt die volle Historie ohne Login', async ({ page }) => {
    await page.goto('/changelog')
    await expect(page).toHaveTitle(/Changelog/i)
    // Neuester + ältester Eintrag sichtbar → Vollhistorie
    await expect(page.getByText('v1.7', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('v0.1', { exact: false }).first()).toBeVisible()
  })
})

test.describe('Login-Seite', () => {
  test('rendert das Anmeldeformular (ohne abzusenden)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible()
  })
})

test.describe('Unbekannte Route', () => {
  test('liefert die Fehlerseite (404)', async ({ page }) => {
    const response = await page.goto('/gibt-es-nicht-xyz')
    expect(response?.status()).toBe(404)
  })
})
