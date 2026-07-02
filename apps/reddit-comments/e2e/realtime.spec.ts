import { test, expect } from '@playwright/test'
import { Client, TablesDB, ID, Permission, Role } from 'node-appwrite'

/**
 * Realtime-Regressions-Guard für die SDK-Socket-Konsolidierung (P1).
 *
 * Ein serverseitig (Admin-Client) angelegter Kommentar muss LIVE im Browser
 * ankommen — über die geteilte, JWT-authentifizierte SDK-Realtime. Deckt genau
 * die manuell verifizierte Zustellung ab (Create-Pill + Delete-Removal), damit
 * eine künftige Regression der Realtime-Konsolidierung auffällt.
 *
 * Env-gated: braucht den Appwrite-Runtime-Key (.env wird von playwright.config
 * geladen). Ohne Key (z. B. CI) überspringt sich der Test.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && databaseId && apiKey)

test.describe('Realtime (geteilter SDK-Socket)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — Realtime-E2E übersprungen.')

  test('serverseitig angelegter Kommentar erscheint live und verschwindet beim Löschen', async ({ page }) => {
    const db = new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const marker = `E2E-RT ${ID.unique()}`
    let rowId = ''

    // Gast-Tab auf der Demo-Seite (Kommentare read:any → Gast-WS empfängt Events)
    await page.goto('/')
    await expect(page.locator('[data-comment-section]')).toBeVisible()
    // WS-Subscription muss STEHEN, bevor wir schreiben — Kommentare haben keinen
    // Poll-Fallback, ein vor dem subscribe() eingefügter Kommentar ginge verloren.
    // onMounted → ensureRealtimeJwt (fetch) → realtime.subscribe (debounce+connect).
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    try {
      const row = await db.createRow({
        databaseId: databaseId!,
        tableId: 'comments',
        rowId: ID.unique(),
        data: {
          targetId: 'demo-post', targetType: 'post', content: marker,
          authorId: 'e2e-rt-bot', authorName: 'E2E RT Bot',
          parentId: null, upvotes: 0, downvotes: 0, score: 0, status: 'active',
        },
        // Row-Level read(any) wie index.post.ts — die Table hat seit
        // Migration 008 kein Table-read(any) mehr (hidden-REST-Leak-Fix)
        permissions: [Permission.read(Role.any())],
      })
      rowId = row.$id

      // Fremder Top-Level-Kommentar wird gepuffert → Pill „Show new comments"
      const pill = page.getByRole('button', { name: /show new comments/i })
      await expect(pill).toBeVisible({ timeout: 15_000 })
      await pill.click()
      await expect(page.getByText(marker)).toBeVisible()

      // Löschen → Realtime-Delete entfernt den Kommentar wieder
      await db.deleteRow({ databaseId: databaseId!, tableId: 'comments', rowId })
      rowId = ''
      await expect(page.getByText(marker)).toBeHidden({ timeout: 15_000 })
    }
    finally {
      // Sicherheitsnetz: Testdaten auch bei Fehler entfernen
      if (rowId) await db.deleteRow({ databaseId: databaseId!, tableId: 'comments', rowId }).catch(() => {})
    }
  })
})
