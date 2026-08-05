#!/usr/bin/env node
/**
 * „SCHREIBFLÄCHE AUF UEditor" — der Beweis (2026-08-04).
 *
 * Der Composer (und das Bearbeiten-Feld, es ist dieselbe Komponente
 * `PostBodyField`) schreibt seit heute mit `UEditor` im Markdown-Modus. Das
 * Speicherformat bleibt das Markdown-SUBSET aus core/shared/markdown.ts —
 * genau das ist hier zu beweisen, und zwar an der Stelle, an der es kippen
 * würde: nicht in einem Nachbau, sondern im echten Editor im echten Browser,
 * über die echte Route, mit dem echten Renderer.
 *
 * WARUM EIN BROWSER: die Umstellung lebt vollständig im Client. Ein
 * node-only-Skript könnte hier nur eine Zeichenkette an `POST /api/posts`
 * schicken und sich selbst bestätigen — es würde exakt das nicht messen, was
 * gemessen werden muss (was der Editor beim Serialisieren aus dem Getippten
 * macht). Playwright liegt in `apps/comments`; von dort wird es geladen
 * (absoluter Pfad, siehe unten) — dieses Paket bekommt dafür KEINE eigene
 * Abhängigkeit.
 *
 * VIER FRAGEN, in dieser Reihenfolge:
 *  (1) NACHLADEN — steht Tiptap im Bündel der Feed-Ansicht? (Soll: nein,
 *      erst wenn jemand die Schreibfläche berührt.)
 *  (2) RUNDLAUF — jedes Element des Subsets: tippen → speichern → wieder
 *      öffnen → unverändert → gerendert kommt das Richtige.
 *  (3) FLIESSTEXT — `snake_case`, `2 * 3`, `[Name]`, `C:\Users\test`,
 *      `a < b`. GESPEICHERT wird hier maskiert (`snake\_case`), und das ist
 *      seit F48 richtig: der Parser löst es auf. GERENDERT muss wieder genau
 *      dastehen, was getippt wurde.
 *  (4) GRENZEN — der Editor darf nichts erzeugen, was der Parser nicht
 *      rendert: Trennlinie, abgeschaltete Tastenkürzel, HTML aus der
 *      Zwischenablage, `javascript:`-Link.
 * Dazu (5): „Öffnen darf nichts ändern" an einem BESTANDS-Beitrag, der noch
 * aus der Textflächen-Zeit stammt.
 *
 * Aus packages/posts (dort löst node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server derselben Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-composer-editor.mjs http://localhost:3001
 *
 * Legt einen Wegwerf-Nutzer samt Beiträgen an und räumt beides wieder weg —
 * auch im Fehlerfall (Beiträge über den Admin-Client, damit auch ein
 * abgebrochener Lauf nichts liegen lässt).
 */
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

/**
 * Playwright wohnt in `apps/comments` (dort läuft die E2E-Suite). Ein
 * `import 'playwright'` fände es von hier aus NICHT: pnpm legt es nur in den
 * virtuellen Store, und dessen NODE_PATH-Trick gilt für CommonJS, nicht für
 * ESM. Der absolute Pfad ist deshalb Absicht und keine Bequemlichkeit.
 */
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
let user = null
let browser = null

try {
  user = await users.create({
    userId: ID.unique(),
    email: `composer-editor-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Editor Tester ${stamp}`,
  })
  const session = await users.createSession({ userId: user.$id })

  browser = await chromium.launch()
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
  const page = await context.newPage()

  // Was der Composer abschickt bzw. das Bearbeiten-Feld patcht — das ist der
  // Text, der in `community_posts.body` landet.
  let lastPost = null
  let lastPatch = null
  page.on('request', (req) => {
    const url = req.url()
    if (req.method() === 'POST' && url.endsWith('/api/posts')) {
      try { lastPost = JSON.parse(req.postData() ?? '{}') } catch { lastPost = null }
    }
    if (req.method() === 'PATCH' && /\/api\/posts\/[^/]+$/.test(url)) {
      try { lastPatch = JSON.parse(req.postData() ?? '{}') } catch { lastPatch = null }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // (1) NACHLADEN
  // ────────────────────────────────────────────────────────────────────────
  const scripts = []
  page.on('response', res => scripts.push(res.url()))

  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-body] textarea', { timeout: 90_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  const beforeFocus = scripts.filter(u => /tiptap|prosemirror/i.test(u)).length
  check('Feed OHNE Schreibabsicht lädt kein Tiptap', beforeFocus === 0, `${beforeFocus} Anfragen`)

  // Der Wechsel hängt am FOKUS (siehe PostBodyField) — erst hier kommt der Editor.
  await page.locator('[data-composer-body] textarea').click()
  await page.waitForSelector('[data-composer-body] [contenteditable="true"]', { timeout: 30_000 })
  await page.waitForTimeout(1200)
  const afterFocus = scripts.filter(u => /tiptap|prosemirror/i.test(u)).length
  check('… und holt ihn beim ersten Fokus nach', afterFocus > 0, `${afterFocus} Anfragen`)
  check('Werkzeugleiste steht', await page.locator('[data-composer-body] [role="toolbar"]').count() === 1)

  const editor = page.locator('[data-composer-body] [contenteditable="true"]')

  async function clearEditor() {
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
  }

  /** Zeilen tippen (Enter dazwischen) — Eingaberegeln greifen nur beim Tippen. */
  async function typeLines(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(lines[i], { delay: 6 })
    }
  }

  /** Veröffentlichen und zurückgeben, was gespeichert wurde + wie es rendert. */
  async function publish() {
    lastPost = null
    await page.locator('[data-composer-submit]').click()
    await page.waitForTimeout(700)
    const rendered = await page.evaluate(() => {
      const card = document.querySelector('[data-post-card]')
      const body = card?.querySelector('.space-y-2')
      return { html: body?.innerHTML ?? '', text: body?.textContent ?? '' }
    })
    return { stored: lastPost?.body ?? '', ...rendered }
  }

  /**
   * Den obersten Beitrag zum Bearbeiten öffnen, EINEN Anschlag machen und
   * wieder zurücknehmen, dann speichern. Der Anschlag ist Absicht: ohne ihn
   * griffe die Regel „Öffnen darf nichts ändern" (core/shared/editorBody.ts)
   * und schickte die Urfassung — gemessen werden soll hier aber, was der
   * EDITOR aus dem gespeicherten Text macht.
   */
  async function openEdit() {
    // Escape zuerst: ein noch offenes Menü würde den nächsten Klick schlucken.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await page.locator('[data-post-card]').first().locator('button[aria-label="Actions"]').click()
    await page.waitForTimeout(300)
    await page.getByRole('menuitem', { name: 'Edit' }).first().click()
    await page.waitForSelector('[data-post-edit-body] [contenteditable="true"]', { timeout: 20_000 })
    await page.waitForTimeout(400)
  }

  async function reopenAndSave({ touch = true } = {}) {
    await openEdit()
    if (touch) {
      await page.locator('[data-post-edit-body] [contenteditable="true"]').click()
      await page.keyboard.press('End')
      await page.keyboard.type('x')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(150)
    }
    lastPatch = null
    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(700)
    return lastPatch?.body ?? ''
  }

  // ────────────────────────────────────────────────────────────────────────
  // (2) RUNDLAUF JE ELEMENT
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Rundlauf je Element ──────────────────────────────────────')
  const roundtrip = [
    { label: 'fett', lines: ['**fett** hier'], stored: '**fett** hier', html: '<strong>fett</strong>' },
    { label: 'kursiv', lines: ['*kursiv* hier'], stored: '*kursiv* hier', html: '<em>kursiv</em>' },
    { label: 'Code-Span', lines: ['`code()` hier'], stored: '`code()` hier', html: '<code' },
    { label: 'Überschrift 2', lines: ['## Kopf zwei'], stored: '## Kopf zwei', html: '<h2' },
    { label: 'Überschrift 3', lines: ['### Kopf drei'], stored: '### Kopf drei', html: '<h3' },
    { label: 'Aufzählung', lines: ['- eins', 'zwei'], stored: '- eins\n- zwei', html: '<ul' },
    { label: 'Nummerierte Liste', lines: ['1. eins', 'zwei'], stored: '1. eins\n2. zwei', html: '<ol' },
    { label: 'Zitat', lines: ['> zitiert'], stored: '> zitiert', html: '<blockquote' },
    { label: 'Codeblock', lines: ['```', 'const a = 1'], stored: '```\nconst a = 1\n```', html: '<pre' },
  ]

  for (const item of roundtrip) {
    await clearEditor()
    await typeLines(item.lines)
    const result = await publish()
    checkEqual(`${item.label}: gespeichert`, result.stored, item.stored)
    check(`${item.label}: gerendert`, result.html.includes(item.html), result.html.slice(0, 200))
    const again = await reopenAndSave()
    checkEqual(`${item.label}: wieder geöffnet — unverändert`, again, item.stored)
  }

  /**
   * VERSCHACHTELTE LISTE — festgehalten, WEIL sie nicht ganz durchläuft: der
   * Editor kann einrücken (Tab), gespeichert wird die Einrückung korrekt und
   * der Rundlauf ist stabil — aber `parseMarkdown` kennt keine Verschachtelung
   * und rendert FLACH (drei `<li>` in EINER `<ul>`). Das ist keine Neuerung
   * dieser Umstellung: derselbe Text, in die alte Textfläche getippt, wurde
   * genauso flach dargestellt. Es ist auch kein Datenverlust — die Einrückung
   * steht in der Spalte. Wer sie eines Tages darstellen will, ändert den
   * RENDERER (eigenes Paket); dann schlägt genau diese Prüfung an.
   */
  await clearEditor()
  await page.keyboard.type('- eins', { delay: 8 })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('unter', { delay: 8 })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('zwei', { delay: 8 })
  const nested = await publish()
  checkEqual('verschachtelte Liste: gespeichert (mit Einrückung)', nested.stored, '- eins\n  - unter\n- zwei')
  check('verschachtelte Liste: gerendert — heute FLACH (Renderer-Grenze)',
    (nested.html.match(/<ul/g) ?? []).length === 1 && (nested.html.match(/<li>/g) ?? []).length === 3,
    nested.html.slice(0, 250))
  checkEqual('verschachtelte Liste: wieder geöffnet — unverändert', await reopenAndSave(), '- eins\n  - unter\n- zwei')

  // Links entstehen über die Werkzeugleiste (der Editor hat keine
  // Eingaberegel für `[Text](URL)` — getippt bliebe es Text).
  for (const [label, href, expectHtml] of [
    ['Link extern', 'https://example.com/x', 'href="https://example.com/x"'],
    ['Link intern', '/discussions', 'href="/discussions"'],
  ]) {
    await clearEditor()
    await page.keyboard.type('Zielwort', { delay: 6 })
    await page.keyboard.press('ControlOrMeta+a')
    page.removeAllListeners('dialog')
    page.on('dialog', d => d.accept(href))
    await page.locator('[data-composer-body] [aria-label="Link"]').click()
    await page.waitForTimeout(250)
    const result = await publish()
    checkEqual(`${label}: gespeichert`, result.stored, `[Zielwort](${href})`)
    check(`${label}: gerendert`, result.html.includes(expectHtml), result.html.slice(0, 200))
    const again = await reopenAndSave()
    checkEqual(`${label}: wieder geöffnet — unverändert`, again, `[Zielwort](${href})`)
  }

  // ────────────────────────────────────────────────────────────────────────
  // (3) GEWÖHNLICHER FLIESSTEXT
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Fließtext (der Fall, der den ersten Anlauf gestoppt hat) ──')
  const plain = [
    { typed: 'Wir nutzen snake_case im Code.', stored: 'Wir nutzen snake\\_case im Code.' },
    { typed: 'Platzhalter [Name] bitte ersetzen', stored: 'Platzhalter \\[Name\\] bitte ersetzen' },
    { typed: 'Pfad C:\\Users\\test', stored: 'Pfad C:\\\\Users\\\\test' },
    { typed: 'Vergleich a < b und c > d', stored: 'Vergleich a &lt; b und c &gt; d' },
    { typed: 'Prozent 50% und ~ungefaehr', stored: 'Prozent 50% und \\~ungefaehr' },
  ]
  for (const item of plain) {
    await clearEditor()
    await page.keyboard.type(item.typed, { delay: 6 })
    const result = await publish()
    checkEqual(`gespeichert: ${item.typed}`, result.stored, item.stored)
    checkEqual(`gerendert wie getippt: ${item.typed}`, result.text.trim(), item.typed)
  }

  /**
   * DIE EINE AUSNAHME, und sie ist KEINE Regression: ein Sternchen-PAAR ist
   * Betonung — auch in einer Rechnung. Gemessen wird deshalb, dass sich am
   * ERGEBNIS FÜR DEN LESER nichts geändert hat: die alte Textfläche speicherte
   * `2 * 3 * 4 = 24` roh, und `parseMarkdown` machte daraus schon immer
   * `2 <em> 3 </em> 4 = 24` (core/tests/markdown.test.ts nagelt das fest). Der
   * Editor nimmt dieselbe Deutung nur früher vor — sichtbar beim Tippen statt
   * überraschend beim Veröffentlichen.
   */
  await clearEditor()
  await page.keyboard.type('Rechnung: 2 * 3 * 4 = 24', { delay: 8 })
  const asterisks = await publish()
  checkEqual('Sternchen-Paar wird Betonung (wie vorher schon im Renderer)',
    asterisks.stored, 'Rechnung: 2  *3*  4 = 24')
  check('… und der Leser sieht dieselbe Betonung wie vor der Umstellung',
    asterisks.html.includes('<em>3</em>'), asterisks.html.slice(0, 200))

  // ────────────────────────────────────────────────────────────────────────
  // (4) GRENZEN — was der Editor NICHT erzeugen darf
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Grenzen ──────────────────────────────────────────────────')

  await clearEditor()
  await page.keyboard.type('---', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.keyboard.type('danach', { delay: 10 })
  const ruleHtml = await editor.innerHTML()
  check('`---` wird KEINE Trennlinie (Eingaberegel abgeschaltet)', !ruleHtml.includes('<hr'), ruleHtml.slice(0, 200))

  await clearEditor()
  await page.keyboard.type('abc', { delay: 10 })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+u')
  await page.keyboard.press('ControlOrMeta+Shift+x')
  const markHtml = await editor.innerHTML()
  check('Strg+U / Strg+Shift+X erzeugen nichts', markHtml === '<p>abc</p>', markHtml.slice(0, 200))

  await clearEditor()
  await page.evaluate(async () => {
    const el = document.querySelector('[data-composer-body] [contenteditable="true"]')
    el.focus()
    const dt = new DataTransfer()
    dt.setData('text/html', '<h1>Riesenkopf</h1><table><tr><td>Zelle A</td></tr></table><hr><img src="https://example.com/a.png"><s>durch</s><u>unter</u><p>danach</p>')
    dt.setData('text/plain', 'Ersatztext')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(400)
  const pastedHtml = await editor.innerHTML()
  check('Einfügen: keine h1', !pastedHtml.includes('<h1'), pastedHtml.slice(0, 300))
  check('Einfügen: keine Tabelle', !pastedHtml.includes('<table'), pastedHtml.slice(0, 300))
  check('Einfügen: keine Trennlinie', !pastedHtml.includes('<hr'), pastedHtml.slice(0, 300))
  check('Einfügen: kein Bild', !pastedHtml.includes('<img'), pastedHtml.slice(0, 300))
  check('Einfügen: kein Durchstreichen/Unterstreichen', !/<s>|<u>/.test(pastedHtml), pastedHtml.slice(0, 300))
  const pasted = await publish()
  check('Einfügen: der TEXT bleibt', pasted.text.includes('Riesenkopf') && pasted.text.includes('danach'), pasted.text.slice(0, 200))
  check('Einfügen: der Parser bekommt nur Bekanntes', !/<h1|<table|<hr|<img/.test(pasted.html), pasted.html.slice(0, 300))

  await clearEditor()
  await page.keyboard.type('Zielwort', { delay: 6 })
  await page.keyboard.press('ControlOrMeta+a')
  page.removeAllListeners('dialog')
  page.on('dialog', d => d.accept('javascript:alert(1)'))
  await page.locator('[data-composer-body] [aria-label="Link"]').click()
  await page.waitForTimeout(250)
  const jsHtml = await editor.innerHTML()
  check('`javascript:` wird kein Link (Editor)', !jsHtml.includes('<a '), jsHtml.slice(0, 200))
  const jsResult = await publish()
  check('`javascript:` wird kein Link (Renderer)', !jsResult.html.includes('<a '), jsResult.html.slice(0, 200))

  /**
   * EMOJI sind reiner Text — deshalb darf dieses Menü mit, während das
   * Erwähnungs-Menü draußen bleibt. Zwei Fragen: kommt ein Emoji durch, und
   * frisst der `:`-Auslöser gewöhnliche Doppelpunkte?
   */
  await clearEditor()
  await page.keyboard.type(':thumbsup', { delay: 40 })
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  await page.keyboard.type(' geschafft', { delay: 8 })
  const emoji = await publish()
  check('Emoji-Menü fügt reinen Text ein', emoji.stored.includes('👍'), JSON.stringify(emoji.stored))
  check('… und der Leser sieht es', emoji.text.includes('👍'), JSON.stringify(emoji.text.slice(0, 120)))

  await clearEditor()
  await page.keyboard.type('Hinweis: heute um 12:30 Uhr', { delay: 8 })
  const colon = await publish()
  checkEqual('gewöhnliche Doppelpunkte bleiben unangetastet', colon.text.trim(), 'Hinweis: heute um 12:30 Uhr')

  // GFM-Syntax, die der Renderer nicht kennt, darf keine Zeichen fressen.
  await clearEditor()
  await page.keyboard.type('~~alt~~ und | a | b |', { delay: 6 })
  const gfm = await publish()
  checkEqual('~~alt~~ bleibt Text (kein GFM)', gfm.text.trim(), '~~alt~~ und | a | b |')

  // ────────────────────────────────────────────────────────────────────────
  // (5) ÖFFNEN DARF NICHTS ÄNDERN — an einem BESTANDS-Beitrag
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Bestands-Beitrag: öffnen, speichern, nichts tippen ───────')
  const legacyBody = 'Bestand aus der Textflächen-Zeit: snake_case, [Platzhalter], 2 * 3.'
  const legacy = await page.evaluate(async body => await $fetch('/api/posts', { method: 'POST', body: { type: 'post', body } }), legacyBody)
    .catch(async () => await page.evaluate(async body => (await fetch('/api/posts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'post', body }),
    })).json(), legacyBody))
  check('Bestands-Beitrag angelegt (roher Text, ohne Editor)', legacy?.body === legacyBody, JSON.stringify(legacy)?.slice(0, 200))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const untouched = await reopenAndSave({ touch: false })
  checkEqual('ohne Tastendruck gespeichert = Urfassung', untouched, legacyBody)

  const afterSave = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: legacy.$id })
  checkEqual('… und in der Datenbank steht sie unverändert', afterSave.body, legacyBody)
  check('… und der Beitrag gilt NICHT als bearbeitet', !afterSave.editedAt, `editedAt: ${afterSave.editedAt}`)

  /**
   * GEGENPROBE — ohne sie wäre der Beweis wertlos: eine Regel, die IMMER die
   * Urfassung schickt, bestünde die Prüfung oben genauso.
   */
  await openEdit()
  await page.locator('[data-post-edit-body] [contenteditable="true"]').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' WIRKLICH GEAENDERT', { delay: 6 })
  lastPatch = null
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.waitForTimeout(800)
  check('Gegenprobe: eine echte Bearbeitung wird gespeichert',
    (lastPatch?.body ?? '').includes('WIRKLICH GEAENDERT'), JSON.stringify(lastPatch)?.slice(0, 200))
  const afterEdit = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: legacy.$id })
  check('Gegenprobe: … und JETZT gilt der Beitrag als bearbeitet', Boolean(afterEdit.editedAt), `editedAt: ${afterEdit.editedAt}`)
}
finally {
  if (browser) await browser.close().catch(() => {})
  if (user) {
    // Beiträge über den Admin-Client: ein abgebrochener Lauf soll nichts
    // liegen lassen, auch wenn die Session-Runde nicht mehr durchläuft.
    const rows = await tablesDB.listRows({
      databaseId,
      tableId: 'community_posts',
      queries: [Query.equal('authorId', user.$id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of rows.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'community_posts', rowId: row.$id }).catch(() => {})
    }
    await users.delete({ userId: user.$id }).catch(() => {})
  }
}

console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed}/${passed + failed}`)
process.exit(failed === 0 ? 0 : 1)
