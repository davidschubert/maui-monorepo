import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * E2 Embed-Login (Plan-Task 11): Schreiben im cross-origin iframe über den
 * Popup-Handoff — Klick auf „Anmelden" im Widget öffnet das Login-Popup
 * (Top-Level, first-party), nach Erfolg wandert die Session per Handoff-Token
 * ins iframe (POST /api/auth/embed-session) und der Composer erscheint.
 *
 * localhost:PORT↔PORT ist same-SITE — der Flow (Popup, Token, Cookie-Setzen,
 * Composer) wird hier vollständig bewiesen; das CHIPS-Partitionierungs-
 * Verhalten selbst greift erst auf echten Cross-Site-Domains (Prod-Beweis
 * auf davidschubert.com, dokumentiert in docs/EMBED.md).
 *
 * Credentials: Demo-Seed (pnpm seed) — lokal wie in CI (bootstrap --seed).
 */

let hostPort = 0
let hostServer: Server

test.beforeAll(async () => {
  hostPort = 4930 + test.info().workerIndex
  const htmlPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../packages/comments/.embed-test/index.html',
  )
  const html = readFileSync(htmlPath, 'utf8')
  hostServer = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html)
  })
  await new Promise<void>(done => hostServer.listen(hostPort, done))
})

test.afterAll(async () => {
  await new Promise<void>(done => hostServer.close(() => done()))
})

test.describe('Embed-Login (E2, Popup-Handoff)', () => {
  test('Gast → Popup-Login → Composer im iframe → Kommentar schreiben', async ({ page, context, baseURL }) => {
    const targetId = `e2e-embed-write-${Date.now()}`
    await page.goto(`http://localhost:${hostPort}/?widget=${baseURL}&target=${targetId}`)

    const frame = page.frameLocator('#maui-comments iframe')
    await expect(frame.locator('[data-comment-section]')).toBeVisible({ timeout: 15_000 })

    // Hydration im IFRAME abwarten — vorher wäre der Klick ein toter SSR-Klick
    // (Befund beim Bauen: SSR-Markup ist sichtbar, bevor Vue Handler bindet)
    const widgetFrame = page.frames().find(f => f.url().includes('/embed'))
    expect(widgetFrame).toBeTruthy()
    await widgetFrame!.waitForFunction(() => {
      const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
      return Boolean(root?.__vue_app__)
    }, undefined, { timeout: 30_000 })

    // Gast-Zustand: Embed-CTA (Button, kein Login-Link — keine Navigation im Widget)
    const loginButton = frame.locator('[data-embed-login] button')
    await expect(loginButton).toBeVisible()

    // Popup öffnet Top-Level auf unserer Origin mit ?embed=1
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      loginButton.click(),
    ])
    await popup.waitForLoadState('domcontentloaded')
    expect(popup.url()).toContain('/login')
    expect(popup.url()).toContain('embed=1')
    // Auch das Popup erst nach der Hydration bedienen (sonst toter SSR-Klick)
    await popup.waitForFunction(() => {
      const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
      return Boolean(root?.__vue_app__)
    }, undefined, { timeout: 30_000 })

    // Login im Popup (voller bestehender Auth-Stack, first-party)
    await popup.getByRole('textbox', { name: /mail/i }).fill('uma@demo.local')
    await popup.locator('input[type="password"]').fill('Demo-Passw0rd!')
    await popup.getByRole('button', { name: /anmelden|sign in/i }).click()

    // DAS Erfolgssignal ist der Composer im iframe (Handoff angekommen, ohne
    // Reload) — das Popup-close ist Best-effort-Kosmetik und unter paralleler
    // Testlast kein verlässliches Ereignis (Flake im Voll-Suite-Lauf).
    await expect(frame.locator('[data-comment-composer]')).toBeVisible({ timeout: 30_000 })

    // Schreiben funktioniert end-to-end (CSRF-Origin-Check + Rate-Limits aktiv)
    await frame.locator('[data-comment-composer] textarea').fill('E2-Embed-Kommentar über den Popup-Login')
    await frame.locator('[data-comment-composer] button[type="submit"]').click()
    await expect(frame.locator('[data-comment-section]')).toContainText('E2-Embed-Kommentar über den Popup-Login', { timeout: 15_000 })
  })
})
