#!/usr/bin/env node
/**
 * „NAMENSVERVOLLSTÄNDIGUNG BEIM TIPPEN" — der Beweis (2026-08-05).
 *
 * Das Erwähnungs-Paket selbst ist seit dem 2026-08-04 bewiesen
 * (verify-handles-mentions.mjs, 34/34). Hier geht es NUR um die Tipphilfe —
 * und um die eine Stelle, an der sie das Produkt beschädigen könnte.
 *
 * DIE ENTSCHEIDENDE FRAGE ist nicht „erscheint ein Menü", sondern: was steht
 * NACH einer Auswahl in `community_posts.body`? Das Menü fügt einen
 * mention-KNOTEN ein, und der serialisiert von Haus aus zu
 * `[@ id="…" label="…"]`. Genau daran ist das Vorgänger-Paket gescheitert.
 * Prüfung (3) ist deshalb der Kern, alles andere ist Beiwerk.
 *
 * SIEBEN FRAGEN:
 *  (1) MENÜ — öffnet `@name` eine Liste, und steht der gesuchte Name drin?
 *  (2) TASTATUR — lässt sich mit Pfeil + Enter auswählen, ohne Maus?
 *  (3) SPEICHERFORMAT — steht danach `@handle` als GEWÖHNLICHER TEXT im Body,
 *      und KEINE Klammer-Syntax? (der eigene renderMarkdown-Handler)
 *  (4) ANZEIGE — wird die so eingefügte Erwähnung hervorgehoben?
 *  (5) BENACHRICHTIGUNG — kommt sie an, mit dem Typ `post.mention` statt dem
 *      Rückfall 'replied'?
 *  (6) GEGENPROBEN — `@` mitten im Wort (`e@mail`) löst NICHTS aus; ein
 *      unbekannter Name bleibt harmloser Text; ein nacktes `@` blättert nicht
 *      die Mitgliederliste auf.
 *  (7) BESTAND — ein Beitrag mit `@handle` im Text bleibt beim Öffnen und
 *      Speichern OHNE Tastendruck byte-gleich (bodyToSave).
 *
 * Aus packages/posts (dort löst node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server derselben Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-mention-menu.mjs http://localhost:3001
 *
 * Legt zwei Wegwerf-Nutzer samt Beiträgen an und räumt beides wieder weg —
 * auch im Fehlerfall.
 */
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

/** Playwright wohnt in apps/comments — absoluter Pfad, siehe verify-handles-mentions.mjs. */
const playwrightEntry = new URL('../../../apps/comments/node_modules/@playwright/test/index.mjs', import.meta.url)
const { chromium } = await import(playwrightEntry.href).catch(() => {
  console.error('✗ Playwright nicht gefunden — `pnpm install` in apps/comments und einmalig `npx playwright install chromium`.')
  process.exit(1)
})

const base = process.argv[2] ?? 'http://localhost:3001'
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen (Runtime-Key mit users/sessions/rows).')
  process.exit(1)
}

const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(adminClient)
const tablesDB = new TablesDB(adminClient)

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`) }
}
function checkEqual(name, actual, expected) {
  check(name, actual === expected, `erwartet: ${JSON.stringify(expected)}\n    bekommen: ${JSON.stringify(actual)}`)
}

const stamp = Date.now().toString(36)
let author = null
let target = null
let browser = null
const createdPosts = []

async function contextFor(user) {
  const session = await users.createSession({ userId: user.$id })
  const context = await browser.newContext({ baseURL: base })
  await context.addCookies([{
    name: `a_session_${projectId}`,
    value: session.secret,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }])
  return context
}

/** Der Composer ist erst nach der HYDRATION bedienbar — siehe verify-handles-mentions.mjs. */
async function openEditor(page) {
  await page.waitForSelector('[data-composer-body] textarea', { timeout: 90_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  await page.locator('[data-composer-body] textarea').click()
  await page.waitForSelector('[data-composer-body] [contenteditable="true"]', { timeout: 120_000 })
  await page.waitForTimeout(600)
}

try {
  author = await users.create({
    userId: ID.unique(),
    email: `menu-author-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Menue Autor ${stamp}`,
  })
  target = await users.create({
    userId: ID.unique(),
    email: `menu-target-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'Mareike Menzel',
  })

  browser = await chromium.launch()
  const authorCtx = await contextFor(author)
  const targetCtx = await contextFor(target)

  // Handles vergeben (die Route legt beim ersten Aufruf an).
  const targetHandle = (await (await targetCtx.request.get('/api/handles/me')).json()).handle
  await authorCtx.request.get('/api/handles/me')
  check('Das Ziel hat einen Handle', typeof targetHandle === 'string' && targetHandle.length >= 3, String(targetHandle))

  // Der Zuträger selbst — und die Gegenprobe, dass er eine Sitzung VERLANGT.
  const anonCtx = await browser.newContext({ baseURL: base })
  checkEqual('GET /api/handles/search ohne Sitzung → 401',
    (await anonCtx.request.get('/api/handles/search?q=abc')).status(), 401)
  await anonCtx.close()

  const page = await authorCtx.newPage()
  let lastPost = null
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/posts')) {
      try { lastPost = JSON.parse(req.postData() ?? '{}') } catch { lastPost = null }
    }
  })

  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await openEditor(page)

  const body = page.locator('[data-composer-body] [contenteditable="true"]')

  // ──────────────────────────────────────────────────────────────────────
  // (6a) `@` MITTEN IM WORT löst NICHTS aus — zuerst, weil es den Zustand
  //      sauber lässt (kein Menü, das später stören könnte).
  // ──────────────────────────────────────────────────────────────────────
  await body.click()
  await page.keyboard.type('mail an post', { delay: 15 })
  await page.keyboard.type('@fir', { delay: 40 })
  await page.waitForTimeout(700)
  const menuAfterMidWord = await page.locator('[role="listbox"]').count()
  checkEqual('`@` mitten im Wort (post@fir) öffnet KEIN Menü', menuAfterMidWord, 0)

  // (6b) Ein nacktes `@` blättert nicht die Mitgliederliste auf.
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('hallo ', { delay: 15 })
  await page.keyboard.type('@', { delay: 40 })
  await page.waitForTimeout(700)
  checkEqual('Ein nacktes `@` zeigt KEIN Menü', await page.locator('[role="listbox"]').count(), 0)

  // ──────────────────────────────────────────────────────────────────────
  // (1) MENÜ — jetzt die ersten Zeichen des gesuchten Namens
  // ──────────────────────────────────────────────────────────────────────
  await page.keyboard.type(targetHandle.slice(0, 4), { delay: 60 })
  let menuVisible = true
  await page.waitForSelector('[role="listbox"]', { timeout: 10_000 }).catch(() => { menuVisible = false })
  check('`@` + Anfangsbuchstaben öffnet das Menü', menuVisible)

  const optionTexts = await page.locator('[role="option"]').allTextContents()
  check('Der gesuchte Name steht im Menü',
    optionTexts.some(text => text.includes(targetHandle)),
    `Einträge: ${JSON.stringify(optionTexts)}`)

  // ──────────────────────────────────────────────────────────────────────
  // (2) TASTATUR + (3) SPEICHERFORMAT
  // ──────────────────────────────────────────────────────────────────────
  const optionCount = await page.locator('[role="option"]').count()
  // Genau den richtigen Eintrag ansteuern, statt blind den ersten zu nehmen.
  let index = 0
  for (let i = 0; i < optionCount; i++) {
    const text = await page.locator('[role="option"]').nth(i).textContent()
    if ((text ?? '').includes(targetHandle)) { index = i; break }
  }
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  checkEqual('Nach Enter ist das Menü zu', await page.locator('[role="listbox"]').count(), 0)

  const afterSelect = await body.textContent()
  check('Die Auswahl steht als @handle im Editor',
    (afterSelect ?? '').includes(`@${targetHandle}`),
    `im Editor: ${JSON.stringify(afterSelect)}`)

  await page.keyboard.type(' bitte lesen', { delay: 15 })
  lastPost = null
  await page.locator('[data-composer-submit]').click()
  await page.waitForTimeout(1800)

  const stored = lastPost?.body ?? ''
  check('DER KERN: gespeichert wird @handle als GEWÖHNLICHER TEXT',
    stored.includes(`@${targetHandle}`),
    `gespeichert: ${JSON.stringify(stored)}`)
  check('… und KEINE Klammer-Syntax (der alte Blocker)',
    !stored.includes('[@ id=') && !stored.includes('label="') && !stored.includes('[@'),
    `gespeichert: ${JSON.stringify(stored)}`)

  const postRows = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('authorId', author.$id), Query.orderDesc('$createdAt'), Query.limit(5)],
  })
  const dbPost = postRows.rows[0]
  if (dbPost) createdPosts.push(dbPost.$id)
  check('In community_posts.body steht derselbe Text',
    (dbPost?.body ?? '').includes(`@${targetHandle}`),
    `DB: ${JSON.stringify(dbPost?.body ?? '')}`)
  check('… und die DB-Zeile trägt keine Klammer-Syntax',
    !(dbPost?.body ?? '').includes('[@'),
    `DB: ${JSON.stringify(dbPost?.body ?? '')}`)

  // ──────────────────────────────────────────────────────────────────────
  // (4) ANZEIGE
  // ──────────────────────────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-post-card]', { timeout: 60_000 })
  await page.waitForTimeout(900)
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-post-card]')
    return { html: el?.innerHTML ?? '', text: el?.textContent ?? '' }
  })
  check('Die per Menü eingefügte Erwähnung ist hervorgehoben',
    card.html.includes(`data-mention="${targetHandle}"`),
    card.html.slice(0, 400))
  check('Der sichtbare Text trägt weder Backslash noch Klammer',
    card.text.includes(`@${targetHandle}`) && !card.text.includes('\\') && !card.text.includes('[@'),
    card.text.slice(0, 300))

  // ──────────────────────────────────────────────────────────────────────
  // (5) BENACHRICHTIGUNG
  // ──────────────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 900))
  const notes = await tablesDB.listRows({
    databaseId, tableId: 'notifications',
    queries: [Query.equal('recipientId', target.$id), Query.orderDesc('$createdAt'), Query.limit(25)],
  })
  const mentionNote = notes.rows.find(n => n.type === 'post.mention')
  check('Die Auswahl erzeugt eine Benachrichtigung', !!mentionNote,
    `Typen: ${JSON.stringify(notes.rows.map(n => n.type))}`)
  checkEqual('… mit dem Typ post.mention (NICHT dem Rückfall)', mentionNote?.type, 'post.mention')

  const bellPage = await targetCtx.newPage()
  await bellPage.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await bellPage.waitForTimeout(2500)
  const bellText = await bellPage.evaluate(() => document.body.textContent ?? '')
  check('Die Glocke zeigt den Beitrags-Text, nicht den Kommentar-Rückfall',
    !bellText.includes('replied to your comment') && !bellText.includes('hat auf deinen Kommentar geantwortet'),
    'Rückfall-Text gefunden')
  await bellPage.close()

  // ──────────────────────────────────────────────────────────────────────
  // (6c) UNBEKANNTER Name bleibt harmloser Text
  // ──────────────────────────────────────────────────────────────────────
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await openEditor(page)
  await page.locator('[data-composer-body] [contenteditable="true"]').click()
  await page.keyboard.type('gruss an ', { delay: 15 })
  await page.keyboard.type('@niemandgibteshier', { delay: 30 })
  await page.waitForTimeout(700)
  await page.keyboard.type(' ende', { delay: 15 })
  lastPost = null
  await page.locator('[data-composer-submit]').click()
  await page.waitForTimeout(1800)
  const unknownBody = lastPost?.body ?? ''
  check('Ein unbekannter Name wird als schlichter Text gespeichert',
    unknownBody.includes('@niemandgibteshier') && !unknownBody.includes('[@'),
    `gespeichert: ${JSON.stringify(unknownBody)}`)

  const rows2 = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('authorId', author.$id), Query.orderDesc('$createdAt'), Query.limit(8)],
  })
  for (const r of rows2.rows) if (!createdPosts.includes(r.$id)) createdPosts.push(r.$id)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-post-card]', { timeout: 60_000 })
  await page.waitForTimeout(900)
  const unknownHtml = await page.evaluate(() => document.querySelector('[data-post-card]')?.innerHTML ?? '')
  check('… und NICHT hervorgehoben',
    !unknownHtml.includes('data-mention="niemandgibteshier"'),
    unknownHtml.slice(0, 300))

  // ──────────────────────────────────────────────────────────────────────
  // (7) BESTAND — öffnen + speichern OHNE Tastendruck ändert nichts
  // ──────────────────────────────────────────────────────────────────────
  // Der Bestands-Beitrag entsteht als KOPIE eines echten, durch die Datentür
  // geschriebenen Beitrags — Spalten UND Row-Permissions. Ohne die
  // Permissions liegt die Zeile zwar in der Tabelle, ist für die Sitzung des
  // Autors aber unsichtbar und taucht im Feed nie auf.
  const legacyBody = `Bestand fuer @${targetHandle} mit snake_case und 2 * 3`
  const legacyRow = await tablesDB.createRow({
    databaseId,
    tableId: 'community_posts',
    rowId: ID.unique(),
    data: {
      ...dbPost && Object.fromEntries(Object.entries(dbPost).filter(([k]) => !k.startsWith('$'))),
      body: legacyBody,
      authorId: author.$id,
    },
    permissions: dbPost?.$permissions ?? [],
  })
  createdPosts.push(legacyRow.$id)

  let lastPatch = null
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/api/posts/')) {
      try { lastPatch = JSON.parse(req.postData() ?? '{}') } catch { lastPatch = null }
    }
  })

  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-post-card]', { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)

  // „Bearbeiten" hängt im Aktionen-Menü der Karte (UDropdownMenu), und das
  // rendert seinen Inhalt in einem Portal — also über Playwright-Locator
  // statt über querySelector innerhalb der Karte.
  const legacyCard = page.locator('[data-post-card]').filter({ hasText: 'Bestand fuer' })
  let editOpened = 'ok'
  if (await legacyCard.count() === 0) {
    editOpened = 'kein-beitrag'
  }
  else {
    await legacyCard.first().locator('button[aria-label="Actions"]').click()
    await page.waitForTimeout(400)
    const editItem = page.getByRole('menuitem', { name: 'Edit' })
    if (await editItem.count() === 0) editOpened = 'kein-knopf'
    else await editItem.first().click()
  }

  if (editOpened !== 'ok') {
    check('Bearbeiten-Fläche geöffnet', false, `Ergebnis: ${editOpened} — Prüfung (7) NICHT durchgeführt`)
  }
  else {
    // `immediate` heißt: der Editor kommt sofort, ohne Fokus-Umweg. Warten
    // muss man trotzdem — er wird NACHGELADEN.
    await page.waitForSelector('[data-post-edit-body] [contenteditable="true"]', { timeout: 120_000 })
    await page.waitForTimeout(2000)
    lastPatch = null
    const saveButton = legacyCard.first().getByRole('button', { name: 'Save' })
    const saved = await saveButton.count() > 0
    if (saved) await saveButton.first().click()
    await page.waitForTimeout(2000)
    check('Speichern-Knopf gefunden', saved)
    const after = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: legacyRow.$id })
    checkEqual('Öffnen + Speichern OHNE Tastendruck lässt den Text byte-gleich', after.body, legacyBody)
    check('… und meldet keine Bearbeitung (editedAt bleibt leer)',
      !after.editedAt, `editedAt: ${JSON.stringify(after.editedAt)}`)
    if (lastPatch) console.log(`    (PATCH-Body war: ${JSON.stringify(lastPatch.body)})`)
  }

  await page.close()
}
catch (error) {
  failed++
  console.error(`✗ Unerwarteter Fehler: ${error?.message ?? error}`)
  if (error?.stack) console.error(error.stack.split('\n').slice(1, 5).join('\n'))
}
finally {
  for (const postId of createdPosts) {
    await tablesDB.deleteRow({ databaseId, tableId: 'community_posts', rowId: postId }).catch(() => {})
  }
  for (const user of [author, target]) {
    if (!user) continue
    const handleRows = await tablesDB.listRows({
      databaseId, tableId: 'community_handles',
      queries: [Query.equal('userId', user.$id), Query.limit(50)],
    }).catch(() => ({ rows: [] }))
    for (const row of handleRows.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'community_handles', rowId: row.$id }).catch(() => {})
    }
    const notes = await tablesDB.listRows({
      databaseId, tableId: 'notifications',
      queries: [Query.equal('recipientId', user.$id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of notes.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'notifications', rowId: row.$id }).catch(() => {})
    }
    await users.delete({ userId: user.$id }).catch(() => {})
  }
  await browser?.close()

  console.log(`\n${passed}/${passed + failed} Prüfungen bestanden`)
  process.exit(failed === 0 ? 0 : 1)
}
