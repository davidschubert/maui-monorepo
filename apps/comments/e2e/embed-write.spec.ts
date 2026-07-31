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
 * auf davidschubert.com, dokumentiert in docs/referenz/EMBED.md).
 *
 * Credentials: Demo-Seed (pnpm seed) — lokal wie in CI (bootstrap --seed).
 */

let hostPort = 0
let hostServer: Server

/** Vue hat übernommen — vorher wäre jeder Klick ein toter SSR-Klick. */
const hydrated = () => {
  const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
  return Boolean(root?.__vue_app__)
}

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
  // closeAllConnections() VOR close(): der Browser hält Keep-alive-Sockets auf
  // die Testseite offen, und `close()` wartet auf deren Ende. Genau daran hing
  // der Worker nach grünen Tests minutenlang fest — Playwright bricht das nach
  // 300 s mit „worker-N process did not exit … force-killed it" ab und zählt
  // das als Fehler AUSSERHALB jedes Tests: Exit-Code 1 trotz grüner Suite.
  hostServer.closeAllConnections()
  await new Promise<void>(done => hostServer.close(() => done()))
})

test.describe('Embed-Login (E2, Popup-Handoff)', () => {
  // Der Fall fährt DREI Dokumente hoch (Hostseite, iframe, Popup) und wartet
  // in jedem auf die Hydration. Mit dem 30-s-Standardbudget riss der Test auf
  // einem kalten Server schon beim ersten Warten ab — und meldete dann eine
  // „Hydration-Zeitüberschreitung" statt des echten Fehlers dahinter (genau so
  // stand es tagelang im CI-Log und schickte die Suche in die falsche Ecke).
  // Das Budget muss zur Summe der Wartezeiten passen, sonst lügt der Bericht.
  test.describe.configure({ timeout: 240_000 })

  test('Gast → Popup-Login → Composer im iframe → Kommentar schreiben', async ({ page, context, request, baseURL }) => {
    const targetId = `e2e-embed-write-${Date.now()}`

    // Beide Seiten VORWÄRMEN, bevor die Hostseite lädt — im Browser und bis zur
    // HYDRATION. Der Dev-Server (E2E fährt gegen `pnpm dev`, in CI genauso)
    // kompiliert Route UND Client-Bundle erst beim ersten echten Aufruf; ein
    // reiner SSR-Abruf oder ein `goto` bis 'load' lässt den Client-Graph
    // unfertig (kalt gemessen: die Hydration im iframe riss danach immer noch
    // die 30 s).
    //
    // Warum das hier nicht Kosmetik ist: der Loader (public/embed.js) versteckt
    // das iframe ENDGÜLTIG (display:none + „Comments could not be loaded"),
    // wenn das Widget binnen 10 s keine Höhe meldet — gedacht für den
    // CSP-geblockten Einbetter. Die Höhe kommt aber erst aus onMounted, also
    // nach der Hydration. Kalt reißt das die 10 s, und danach ist der Fall
    // unrettbar: kein Warten heilt ein display:none. In Produktion ist die
    // Route vorgebaut — Dev-Artefakt, keine kaschierte Produkt-Schwäche.
    for (const warm of [`/embed?targetId=${targetId}&targetType=blog`, '/login?embed=1']) {
      await page.goto(`${baseURL}${warm}`)
      await page.waitForFunction(hydrated, undefined, { timeout: 60_000 })
    }

    await page.goto(`http://localhost:${hostPort}/?widget=${baseURL}&target=${targetId}`)

    const frame = page.frameLocator('#pukalani-comments iframe')
    await expect(frame.locator('[data-comment-section]')).toBeVisible({ timeout: 30_000 })

    // Hydration im IFRAME abwarten — vorher wäre der Klick ein toter SSR-Klick
    // (Befund beim Bauen: SSR-Markup ist sichtbar, bevor Vue Handler bindet)
    const widgetFrame = page.frames().find(f => f.url().includes('/embed'))
    expect(widgetFrame).toBeTruthy()
    await widgetFrame!.waitForFunction(hydrated, undefined, { timeout: 60_000 })

    // Gast-Zustand: Embed-CTA (Button, kein Login-Link — keine Navigation im
    // Widget). Der Haken sitzt am KNOPF (data-embed-login-cta), nicht am
    // Container: mit pukalani.comments.embed.guests (E4) rendert statt
    // [data-embed-login] der Gast-Composer, der den Popup-Login als Zusatz
    // trägt. Beide Zweige sind hier gleich gültig — der Test prüft den
    // Handoff, nicht welcher Gast-Zweig konfiguriert ist.
    const loginButton = frame.locator('[data-embed-login-cta]')
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
    await popup.waitForFunction(hydrated, undefined, { timeout: 60_000 })

    // Login im Popup (voller bestehender Auth-Stack, first-party)
    await popup.getByRole('textbox', { name: /mail/i }).fill('uma@demo.local')
    await popup.locator('input[type="password"]').fill('Demo-Passw0rd!')
    await popup.getByRole('button', { name: /anmelden|sign in/i }).click()

    // DAS Erfolgssignal ist der Composer im iframe (Handoff angekommen, ohne
    // Reload) — das Popup-close ist Best-effort-Kosmetik und unter paralleler
    // Testlast kein verlässliches Ereignis (Flake im Voll-Suite-Lauf).
    //
    // 60 s statt 30 s: hier hängt eine ganze Kette von Nitro-Routen dran
    // (/api/auth/login, /embed-handoff, /embed-session, /api/auth/me), die der
    // Dev-Server ALLE erst bei ihrem ersten Aufruf kompiliert — genau daran
    // riss der Fall im kalten Lauf. Das ist eine Lebendigkeits-Wartezeit, keine
    // Leistungsaussage: bleibt der Handoff aus, fällt der Test weiterhin.
    await expect(frame.locator('[data-comment-composer]')).toBeVisible({ timeout: 60_000 })

    // Schreiben funktioniert end-to-end (CSRF-Origin-Check + Rate-Limits aktiv)
    await frame.locator('[data-comment-composer] textarea').fill('E2-Embed-Kommentar über den Popup-Login')
    await frame.locator('[data-comment-composer] button[type="submit"]').click()
    await expect(frame.locator('[data-comment-section]')).toContainText('E2-Embed-Kommentar über den Popup-Login', { timeout: 30_000 })

    // PERSISTENZ statt Optimistic-UI: die sichtbare Einfügung kann einen
    // fehlgeschlagenen POST kurz kaschieren — die API ist die Autorität.
    await expect.poll(async () => {
      const res = await request.get(`${baseURL}/api/comments?targetId=${targetId}&targetType=blog`)
      return ((await res.json()) as { total: number }).total
    }, { timeout: 20_000 }).toBeGreaterThan(0)
  })
})
