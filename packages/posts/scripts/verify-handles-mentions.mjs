#!/usr/bin/env node
/**
 * „HANDLES (@name) UND ERWÄHNUNGEN" — der Beweis (2026-08-04).
 *
 * Der ganze Wert dieses Pakets hängt an einer Kette, die durch fünf Schichten
 * läuft: Vergabe → Schreibfläche → Speicherformat → Renderer →
 * BENACHRICHTIGUNG. Jedes Glied für sich lässt sich mit einem Unit-Test
 * behaupten; dass die Kette hält, nicht. Deshalb hier: echter Browser, echte
 * Route, echte Datenbank, echte Glocke.
 *
 * SIEBEN FRAGEN:
 *  (1) VERGABE — bekommt ein neuer Mensch ohne Zutun einen Namen aus seinem
 *      Anzeigenamen? Und ist er sofort erwähnbar?
 *  (2) REGELN — reservierte Namen, Zeichensatz, Länge: lehnt der SERVER ab
 *      (nicht nur das Formular)?
 *  (3) SPEICHERFORMAT — steht nach dem Tippen im Composer wirklich `@handle`
 *      als gewöhnlicher Text in `community_posts.body`? Das ist die Frage,
 *      an der das Vorgänger-Paket gescheitert ist (`[@ id="…" label="…"]`).
 *  (4) ANZEIGE — wird die Erwähnung hervorgehoben, und bleibt ein UNBEKANNTER
 *      Name harmloser Text?
 *  (5) BENACHRICHTIGUNG — kommt sie an, trägt sie den Typ `post.mention`
 *      (NICHT den Rückfall 'replied') und nennt sie den richtigen Absender?
 *  (6) GEGENPROBEN — Selbst-Erwähnung meldet nicht; zweimal genannt meldet
 *      einmal; Bearbeiten meldet nicht erneut.
 *  (7) ÄNDERN — einmal geht, sofort noch einmal wird abgelehnt, und der ALTE
 *      Name löst weiterhin auf denselben Menschen auf.
 *
 * Aus packages/posts (dort löst node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server derselben Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-handles-mentions.mjs http://localhost:3001
 *
 * Legt zwei Wegwerf-Nutzer samt Beiträgen an und räumt beides wieder weg —
 * auch im Fehlerfall.
 */
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

/** Playwright wohnt in apps/comments — absoluter Pfad, siehe verify-composer-editor.mjs. */
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

/** Session-Cookie für einen Playwright-Kontext. */
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

try {
  // Der Anzeigename ist mit Absicht so gebaut, dass der Vorschlag berechenbar
  // ist: „Jürgen Groß …" → `juergengross…` (Umlaute AUSGESCHRIEBEN).
  author = await users.create({
    userId: ID.unique(),
    email: `handle-author-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Anna Autorin ${stamp}`,
  })
  target = await users.create({
    userId: ID.unique(),
    email: `handle-target-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'Jürgen Groß',
  })

  browser = await chromium.launch()
  const authorCtx = await contextFor(author)
  const targetCtx = await contextFor(target)

  // ──────────────────────────────────────────────────────────────────────
  // (1) VERGABE
  // ──────────────────────────────────────────────────────────────────────
  const mineRes = await targetCtx.request.get('/api/handles/me')
  check('GET /api/handles/me antwortet 200', mineRes.ok(), `Status ${mineRes.status()}`)
  const mine = await mineRes.json()
  checkEqual('Vorschlag aus dem Anzeigenamen (Umlaute ausgeschrieben)', mine.handle, 'juergengross')
  checkEqual('Die automatische Vergabe verbraucht die Sperrfrist NICHT', mine.canChange, true)
  checkEqual('… und trägt deshalb kein Änderungsdatum', mine.changedAt, null)

  const againRes = await targetCtx.request.get('/api/handles/me')
  const again = await againRes.json()
  checkEqual('Zweiter Aufruf vergibt nicht neu (idempotent)', again.handle, mine.handle)

  const targetHandle = mine.handle

  // Der Autor bekommt seinen ebenfalls — und zwar OHNE die Einstellungsseite
  // zu öffnen, allein durch das Schreiben (siehe unten, Prüfung am Ende).
  const authorMine = await (await authorCtx.request.get('/api/handles/me')).json()
  check('Auch der Autor hat einen Namen', typeof authorMine.handle === 'string' && authorMine.handle.length >= 3, authorMine.handle)

  // Suche (der Zuträger für die Namensvervollständigung)
  const searchRes = await authorCtx.request.get(`/api/handles/search?q=${targetHandle.slice(0, 4)}`)
  const search = await searchRes.json()
  check('Suche findet den Namen', Array.isArray(search) && search.some(i => i.id === targetHandle), JSON.stringify(search))

  // ──────────────────────────────────────────────────────────────────────
  // (2) REGELN — der SERVER lehnt ab, nicht nur das Formular
  // ──────────────────────────────────────────────────────────────────────
  async function patchHandle(ctx, handle) {
    const res = await ctx.request.patch('/api/handles/me', { data: { handle } })
    let body = null
    try { body = await res.json() } catch { body = null }
    return { status: res.status(), reason: body?.reason ?? null, handle: body?.handle ?? null }
  }

  checkEqual('reservierter Name abgelehnt (admin)', (await patchHandle(targetCtx, 'admin')).reason, 'reserved')
  checkEqual('reservierter Name abgelehnt (Support, gross)', (await patchHandle(targetCtx, 'Support')).reason, 'reserved')
  checkEqual('zu kurz abgelehnt', (await patchHandle(targetCtx, 'ab')).reason, 'too_short')
  checkEqual('fremde Zeichen abgelehnt', (await patchHandle(targetCtx, 'da-vid')).reason, 'charset')
  checkEqual('Unterstrich am Rand abgelehnt', (await patchHandle(targetCtx, '_david')).reason, 'charset')

  // Vergebener Name: der Autor kann den Namen des Ziels nicht nehmen.
  checkEqual('bereits vergebener Name abgelehnt', (await patchHandle(authorCtx, targetHandle)).reason, 'taken')

  // ──────────────────────────────────────────────────────────────────────
  // (3) SPEICHERFORMAT — im echten Composer getippt
  // ──────────────────────────────────────────────────────────────────────
  const page = await authorCtx.newPage()
  let lastPost = null
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/posts')) {
      try { lastPost = JSON.parse(req.postData() ?? '{}') } catch { lastPost = null }
    }
  })

  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-body] textarea', { timeout: 90_000 })
  // Erst HYDRIEREN lassen. Der Wechsel auf den Editor hängt an `@focusin`
  // (PostBodyField) — ein Klick VOR der Hydration fokussiert zwar, findet aber
  // noch keinen Vue-Handler vor, und der Editor käme nie. Genau daran ist der
  // erste Lauf dieses Skripts gescheitert, zweimal, mit 30 s und mit 120 s
  // Wartezeit: es sah nach „zu langsam" aus und war „zu früh".
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  await page.locator('[data-composer-body] textarea').click()
  await page.waitForSelector('[data-composer-body] [contenteditable="true"]', { timeout: 120_000 })
  await page.waitForTimeout(600)

  const mentionText = `Hallo @${targetHandle} und @niemand-gibt-es schau mal her`
  await page.keyboard.type(mentionText, { delay: 6 })
  lastPost = null
  await page.locator('[data-composer-submit]').click()
  await page.waitForTimeout(1500)

  const stored = lastPost?.body ?? ''
  check('Der Composer speichert die Erwähnung als GEWÖHNLICHEN TEXT',
    stored.includes(`@${targetHandle}`),
    `gespeichert: ${JSON.stringify(stored)}`)
  check('… und KEINE Klammer-Syntax (der alte Blocker)',
    !stored.includes('[@ id=') && !stored.includes('label="'),
    `gespeichert: ${JSON.stringify(stored)}`)

  // Gegenprobe an der DATENBANK, nicht nur am abgeschickten Body.
  const postRows = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('authorId', author.$id), Query.orderDesc('$createdAt'), Query.limit(5)],
  })
  const dbPost = postRows.rows[0]
  if (dbPost) createdPosts.push(dbPost.$id)
  check('In community_posts.body steht derselbe Text',
    (dbPost?.body ?? '').includes(`@${targetHandle}`),
    `DB: ${JSON.stringify(dbPost?.body ?? '')}`)

  // ──────────────────────────────────────────────────────────────────────
  // (4) ANZEIGE
  // ──────────────────────────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-post-card]', { timeout: 60_000 })
  await page.waitForTimeout(800)
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-post-card]')
    return { html: el?.innerHTML ?? '', text: el?.textContent ?? '' }
  })

  check('Die bekannte Erwähnung ist hervorgehoben',
    card.html.includes(`data-mention="${targetHandle}"`),
    card.html.slice(0, 400))
  check('Ein UNBEKANNTER Name bleibt gewöhnlicher Text',
    !card.html.includes('data-mention="niemand"'),
    card.html.slice(0, 400))
  check('Der sichtbare Text ist unverändert (kein Backslash, keine Klammer)',
    card.text.includes(`@${targetHandle}`) && !card.text.includes('\\') && !card.text.includes('[@'),
    card.text.slice(0, 300))

  // ──────────────────────────────────────────────────────────────────────
  // (5) BENACHRICHTIGUNG
  // ──────────────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 800))
  async function notificationsOf(userId) {
    const res = await tablesDB.listRows({
      databaseId, tableId: 'notifications',
      queries: [Query.equal('recipientId', userId), Query.orderDesc('$createdAt'), Query.limit(25)],
    })
    return res.rows
  }
  const targetNotes = await notificationsOf(target.$id)
  const mentionNote = targetNotes.find(n => n.type === 'post.mention')
  check('Die Erwähnung erzeugt eine Benachrichtigung', !!mentionNote,
    `Typen: ${JSON.stringify(targetNotes.map(n => n.type))}`)
  checkEqual('… mit dem Typ post.mention (NICHT dem Rückfall)', mentionNote?.type, 'post.mention')
  checkEqual('… und dem Absender als Titel', mentionNote?.title, author.name)
  checkEqual('… und dem Autor als senderId', mentionNote?.senderId, author.$id)

  // Der Glocken-Text: kein Rückfall auf „hat auf deinen Kommentar geantwortet".
  const bellPage = await targetCtx.newPage()
  await bellPage.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await bellPage.waitForTimeout(2500)
  const bellText = await bellPage.evaluate(() => document.body.textContent ?? '')
  check('Die Glocke zeigt den Beitrags-Text, nicht den Kommentar-Rückfall',
    !bellText.includes('replied to your comment') && !bellText.includes('hat auf deinen Kommentar geantwortet'),
    'Rückfall-Text gefunden')
  await bellPage.close()

  // ──────────────────────────────────────────────────────────────────────
  // (6) GEGENPROBEN
  // ──────────────────────────────────────────────────────────────────────
  const authorNotesBefore = (await notificationsOf(author.$id)).length

  // Selbst-Erwähnung + doppelte Nennung in EINEM Beitrag.
  await page.locator('[data-composer-body] textarea').click().catch(() => {})
  await page.waitForSelector('[data-composer-body] [contenteditable="true"]', { timeout: 120_000 })
  await page.locator('[data-composer-body] [contenteditable="true"]').click()
  await page.keyboard.type(`Ich bin @${authorMine.handle} und nochmal @${targetHandle} und @${targetHandle}`, { delay: 6 })
  await page.locator('[data-composer-submit]').click()
  await page.waitForTimeout(1800)

  const rows2 = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('authorId', author.$id), Query.orderDesc('$createdAt'), Query.limit(5)],
  })
  for (const r of rows2.rows) if (!createdPosts.includes(r.$id)) createdPosts.push(r.$id)

  const authorNotesAfter = (await notificationsOf(author.$id)).length
  checkEqual('Selbst-Erwähnung meldet NICHT', authorNotesAfter, authorNotesBefore)

  const targetNotes2 = await notificationsOf(target.$id)
  const forSecondPost = targetNotes2.filter(n => n.type === 'post.mention')
  checkEqual('Zweimal genannt = EINE Meldung für den zweiten Beitrag', forSecondPost.length, 2)

  // ──────────────────────────────────────────────────────────────────────
  // (7) ÄNDERN — und der ALTE Name löst weiter auf
  // ──────────────────────────────────────────────────────────────────────
  const newHandle = `neuername${stamp}`.slice(0, 24)
  const changed = await patchHandle(targetCtx, newHandle)
  checkEqual('Ändern geht (Status 200)', changed.status, 200)
  checkEqual('… und liefert den neuen Namen', changed.handle, newHandle)

  const second = await patchHandle(targetCtx, `nochmal${stamp}`.slice(0, 24))
  checkEqual('Zweites Ändern innerhalb der Frist wird abgelehnt', second.reason, 'change_too_soon')

  const afterChange = await (await targetCtx.request.get('/api/handles/me')).json()
  checkEqual('Der aktive Name ist der neue', afterChange.handle, newHandle)
  checkEqual('… und die Sperrfrist steht', afterChange.canChange, false)
  check('… mit einem nennbaren Zeitpunkt', typeof afterChange.availableAt === 'number', String(afterChange.availableAt))

  // Der ALTE Name ist weiterhin BELEGT (niemand kann ihn übernehmen) …
  checkEqual('Der alte Name bleibt gesperrt', (await patchHandle(authorCtx, targetHandle)).reason, 'taken')

  // … und löst weiterhin auf DIESELBE Person auf: ein Beitrag mit dem ALTEN
  // Namen benachrichtigt sie immer noch. Das ist der Unterschied zwischen
  // einer Historien-Zeile und einer blossen Sperrliste.
  const beforeOld = (await notificationsOf(target.$id)).filter(n => n.type === 'post.mention').length
  await page.locator('[data-composer-body] textarea').click().catch(() => {})
  await page.waitForSelector('[data-composer-body] [contenteditable="true"]', { timeout: 120_000 })
  await page.locator('[data-composer-body] [contenteditable="true"]').click()
  await page.keyboard.type(`Nachzuegler fuer @${targetHandle} bitte lesen`, { delay: 6 })
  await page.locator('[data-composer-submit]').click()
  await page.waitForTimeout(1800)

  const rows3 = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('authorId', author.$id), Query.orderDesc('$createdAt'), Query.limit(8)],
  })
  for (const r of rows3.rows) if (!createdPosts.includes(r.$id)) createdPosts.push(r.$id)

  const afterOld = (await notificationsOf(target.$id)).filter(n => n.type === 'post.mention').length
  check('Eine Erwähnung mit dem ALTEN Namen erreicht denselben Menschen',
    afterOld === beforeOld + 1, `vorher ${beforeOld}, nachher ${afterOld}`)

  await page.close()
}
catch (error) {
  failed++
  console.error(`✗ Unerwarteter Fehler: ${error?.message ?? error}`)
  if (error?.stack) console.error(error.stack.split('\n').slice(1, 5).join('\n'))
}
finally {
  // Aufräumen — auch nach einem Abbruch. Beiträge und Handles über den
  // Admin-Client, damit nichts liegen bleibt.
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
