#!/usr/bin/env node
/**
 * H3-Pool-Isolation — LIVE-DB-Beweis (repeatable). Ergänzt den pure-logic-
 * Beweis (spikes/s5-pool-silo/test.mjs) um einen echten Appwrite-Roundtrip:
 * seedet Rows für ZWEI Tenants (ta/tb) in den gepoolten Tabellen und prüft,
 * dass die scopeQuery-Filterung (Query.equal('tenantId', …)) auf DB-Ebene
 * wirklich isoliert — für comments UND reports (die Tabellen, die die
 * platform-App ausliefert). Fängt reale Fehler, die pure Logik nicht sieht:
 * fehlende Spalte, nicht-verfügbarer Index, Tippfehler im Feldnamen.
 *
 * Aus packages/comments (dort löst node-appwrite auf):
 *   node --env-file=../../apps/comments/.env scripts/verify-pool-isolation.mjs
 *   node --env-file=<pool.env>               scripts/verify-pool-isolation.mjs
 *
 * Idempotent + selbst-aufräumend: legt Rows mit festem Präfix an und löscht
 * sie am Ende (auch im Fehlerfall). Läuft NUR gegen die in der Env genannte
 * Instanz — nie hartkodiert Prod.
 */
import { Client, ID, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const TA = 'iso-ta', TB = 'iso-tb'
const TARGET = `iso-target-${Date.now()}` // gleicher targetId für BEIDE Tenants — der Härtefall
const created = [] // {table, id}

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}

async function seed(table, data) {
  const row = await tablesDB.createRow({ databaseId, tableId: table, rowId: ID.unique(), data })
  created.push({ table, id: row.$id })
  return row
}

async function countFor(table, tenantId) {
  const res = await tablesDB.listRows({
    databaseId,
    tableId: table,
    queries: [Query.equal('targetId', TARGET), Query.equal('tenantId', tenantId), Query.limit(25)],
  })
  return res.rows
}

try {
  console.log(`Pool-Isolation gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  // ── comments ──────────────────────────────────────────────────────────────
  await seed('comments', {
    targetId: TARGET, targetType: 'page', content: 'A-Kommentar', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: 'u-a', authorName: 'A', upvotes: 0, downvotes: 0, score: 0,
    status: 'active', tenantId: TA,
  })
  await seed('comments', {
    targetId: TARGET, targetType: 'page', content: 'B-Kommentar', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: 'u-b', authorName: 'B', upvotes: 0, downvotes: 0, score: 0,
    status: 'active', tenantId: TB,
  })
  const cA = await countFor('comments', TA)
  const cB = await countFor('comments', TB)
  check('comments: A sieht genau 1 Zeile', cA.length === 1, `(${cA.length})`)
  check('comments: A sieht NUR eigene', cA.every(r => r.tenantId === TA && r.content === 'A-Kommentar'))
  check('comments: B sieht genau 1 Zeile', cB.length === 1, `(${cB.length})`)
  check('comments: B sieht NUR eigene', cB.every(r => r.tenantId === TB && r.content === 'B-Kommentar'))

  // ── reports (H3-Fläche 2) ───────────────────────────────────────────────────
  await seed('reports', {
    reporterId: 'u-a', targetType: 'comment', targetId: TARGET, reason: 'spam', note: null,
    status: 'open', resolvedBy: null, resolution: null, tenantId: TA,
  })
  await seed('reports', {
    reporterId: 'u-b', targetType: 'comment', targetId: TARGET, reason: 'spam', note: null,
    status: 'open', resolvedBy: null, resolution: null, tenantId: TB,
  })
  const rA = await countFor('reports', TA)
  const rB = await countFor('reports', TB)
  check('reports: A sieht genau 1 Meldung', rA.length === 1, `(${rA.length})`)
  check('reports: A sieht NUR eigene', rA.every(r => r.tenantId === TA && r.reporterId === 'u-a'))
  check('reports: B sieht genau 1 Meldung', rB.length === 1, `(${rB.length})`)
  check('reports: B sieht NUR eigene', rB.every(r => r.tenantId === TB && r.reporterId === 'u-b'))

  // Korrektheits-Kern: OHNE tenantId-Filter mischt derselbe targetId beide Tenants
  const mixed = await tablesDB.listRows({
    databaseId, tableId: 'comments',
    queries: [Query.equal('targetId', TARGET), Query.limit(25)],
  })
  check('ohne Scope mischen sich beide Tenants (Beweis, dass der Filter nötig ist)', mixed.rows.length === 2, `(${mixed.rows.length})`)

  // ── pages (Tenant-Homepage) — nur wenn die Tabelle existiert (platform/studio) ──
  const hasPages = await tablesDB.listRows({ databaseId, tableId: 'pages', queries: [Query.limit(1)] })
    .then(() => true).catch(() => false)
  if (hasPages) {
    const SLUG = `iso-home-${TARGET}` // gleicher slug für BEIDE Tenants (Härtefall)
    for (const [tid, title] of [[TA, 'A-Home'], [TB, 'B-Home']]) {
      const row = await tablesDB.createRow({
        databaseId, tableId: 'pages', rowId: ID.unique(),
        data: { slug: SLUG, locale: 'en', title, body: `# ${title}`, status: 'published', sortOrder: 0, tenantId: tid },
      })
      created.push({ table: 'pages', id: row.$id })
    }
    const pA = await tablesDB.listRows({ databaseId, tableId: 'pages', queries: [Query.equal('slug', SLUG), Query.equal('tenantId', TA), Query.limit(5)] })
    const pB = await tablesDB.listRows({ databaseId, tableId: 'pages', queries: [Query.equal('slug', SLUG), Query.equal('tenantId', TB), Query.limit(5)] })
    check('pages: A sieht genau 1 Seite (eigener slug-home)', pA.rows.length === 1, `(${pA.rows.length})`)
    check('pages: A sieht NUR eigene', pA.rows.every(r => r.tenantId === TA && r.title === 'A-Home'))
    check('pages: B sieht genau 1 Seite', pB.rows.length === 1, `(${pB.rows.length})`)
    check('pages: B sieht NUR eigene', pB.rows.every(r => r.tenantId === TB && r.title === 'B-Home'))
  }
  else {
    console.log('↷ pages-Tabelle nicht vorhanden — übersprungen (kein platform/studio-Projekt)')
  }
}
finally {
  // Selbst-Aufräumen — auch bei Fehler
  for (const { table, id } of created) {
    await tablesDB.deleteRow({ databaseId, tableId: table, rowId: id }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen (${created.length} Test-Rows aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}
