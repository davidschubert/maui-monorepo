#!/usr/bin/env node
/**
 * posts im Pool — LIVE-DB-Isolationsbeweis (Muster: comments/scripts/
 * verify-pool-isolation.mjs). Seedet Feed-Rows, Score-Votes und Poll-Stimmen
 * für ZWEI Tenants und prüft, dass die tenantId-Filterung der Datentür auf
 * DB-Ebene wirklich isoliert — inkl. des Härtefalls, dass OHNE Filter beide
 * Tenants im selben Feed landen würden. Fängt reale Fehler, die pure Logik
 * nicht sieht: fehlende Spalte (posts-004), nicht-verfügbarer Index.
 *
 * Aus packages/posts (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 *   node --env-file=<pool.env>               scripts/verify-pool-isolation.mjs
 *
 * Idempotent + selbst-aufräumend (auch im Fehlerfall). Läuft NUR gegen die
 * in der Env genannte Instanz — nie hartkodiert Prod.
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
const RUN = Date.now() // Feed hat kein target — der Lauf-Stempel steckt im body
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

try {
  console.log(`posts-Pool-Isolation gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  // ── community_posts: der Feed (Tür-Query: status+publishedAt, gescopt) ────
  const now = new Date().toISOString()
  const postA = await seed('community_posts', {
    type: 'text', title: 'A-Post', body: `iso-${RUN} A`, authorId: 'u-a', authorName: 'A',
    status: 'published', scheduledAt: null, publishedAt: now, pollOptions: null, pollEndsAt: null,
    upvotes: 0, downvotes: 0, score: 0, communityId: TA,
  })
  const postB = await seed('community_posts', {
    type: 'poll', title: 'B-Poll', body: `iso-${RUN} B`, authorId: 'u-b', authorName: 'B',
    status: 'published', scheduledAt: null, publishedAt: now,
    pollOptions: JSON.stringify(['ja', 'nein']), pollEndsAt: null,
    upvotes: 0, downvotes: 0, score: 0, communityId: TB,
  })

  const feedFor = tid => tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.equal('status', 'published'), Query.contains('body', `iso-${RUN}`), Query.equal('communityId', tid), Query.limit(25)],
  }).then(r => r.rows)
  const fA = await feedFor(TA)
  const fB = await feedFor(TB)
  check('feed: A sieht genau 1 Post', fA.length === 1, `(${fA.length})`)
  check('feed: A sieht NUR eigene', fA.every(r => r.communityId === TA && r.title === 'A-Post'))
  check('feed: B sieht genau 1 Post', fB.length === 1, `(${fB.length})`)
  check('feed: B sieht NUR eigene', fB.every(r => r.communityId === TB && r.title === 'B-Poll'))

  // Korrektheits-Kern: OHNE tenantId-Filter mischt der Feed beide Tenants
  const mixed = await tablesDB.listRows({
    databaseId, tableId: 'community_posts',
    queries: [Query.contains('body', `iso-${RUN}`), Query.limit(25)],
  })
  check('ohne Scope mischen sich beide Tenants (Beweis, dass der Filter nötig ist)', mixed.rows.length === 2, `(${mixed.rows.length})`)

  // ── post_votes: GLEICHER User stimmt in beiden Communities ab (Härtefall:
  //    userId allein trennt nicht — erst tenantId macht die Stimme eindeutig) ─
  await seed('post_votes', { postId: postA.$id, userId: 'u-x', value: 1, communityId: TA })
  await seed('post_votes', { postId: postB.$id, userId: 'u-x', value: -1, communityId: TB })
  const vA = await tablesDB.listRows({
    databaseId, tableId: 'post_votes',
    queries: [Query.equal('userId', 'u-x'), Query.equal('communityId', TA), Query.limit(25)],
  })
  check('post_votes: u-x hat in A genau 1 Stimme (upvote)', vA.rows.length === 1 && vA.rows[0].value === 1, `(${vA.rows.length})`)

  // ── poll_votes: Zählung bleibt im Mandanten ───────────────────────────────
  await seed('poll_votes', { postId: postB.$id, userId: 'u-b2', optionIndex: 0, communityId: TB })
  await seed('poll_votes', { postId: postB.$id, userId: 'u-fremd', optionIndex: 0, communityId: TA }) // absichtlich falsch gestempelt
  const countB = await tablesDB.listRows({
    databaseId, tableId: 'poll_votes',
    queries: [Query.equal('postId', postB.$id), Query.equal('optionIndex', 0), Query.equal('communityId', TB), Query.limit(1)],
  }).then(r => r.total)
  check('poll_votes: B zählt nur eigene Stimmen (1, nicht 2)', countB === 1, `(${countB})`)
}
finally {
  // Selbst-Aufräumen — auch bei Fehler
  for (const { table, id } of created) {
    await tablesDB.deleteRow({ databaseId, tableId: table, rowId: id }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen (${created.length} Test-Rows aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}
