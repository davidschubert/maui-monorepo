/**
 * Geister-Inventar/Aufräumen der abgebrochenen M13-Beweisläufe (LOKALE Dev-
 * Instanz). Ohne `--delete` wird NUR gelesen und gezählt.
 */
import { readFileSync } from 'node:fs'
import { Client, TablesDB, Users, Query } from 'node-appwrite'

const DELETE = process.argv.includes('--delete')

const envOf = path => Object.fromEntries(readFileSync(path, 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const controlEnv = envOf('apps/control/.env')
const poolEnv = envOf('apps/platform/.env')

const mk = (endpoint, project, key) => new Client().setEndpoint(endpoint).setProject(project).setKey(key)
const controlClient = mk(controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID, controlEnv.NUXT_APPWRITE_KEY)
const poolClient = mk(poolEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, poolEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID, poolEnv.NUXT_APPWRITE_KEY)

const control = new TablesDB(controlClient)
const pool = new TablesDB(poolClient)
const controlUsers = new Users(controlClient)
const poolUsers = new Users(poolClient)
const DB = 'main'

// Sicherheitsnetz: NUR lokale Endpunkte.
for (const [name, env] of [['control', controlEnv], ['pool', poolEnv]]) {
  const ep = env.NUXT_PUBLIC_APPWRITE_ENDPOINT
  if (!/^http:\/\/localhost\//.test(ep)) throw new Error(`${name}-Endpunkt ist nicht lokal: ${ep}`)
}

const list = async (db, tableId, queries) => db.listRows({ databaseId: DB, tableId, queries: [...queries, Query.limit(100)] })
  .then(r => r.rows).catch(() => [])

// ── 1. Die Geister finden ──────────────────────────────────────────────────
const communities = await list(control, 'communities', [])
const ghosts = communities.filter(c => /^m13-/.test(c.host ?? '') || c.name === 'M13 Sperrprobe')

console.log(`Communities gesamt: ${communities.length} · davon Geister: ${ghosts.length}`)
for (const g of ghosts) console.log(`  ${g.$id}  tenantId=${g.tenantId}  host=${g.host}  suspension=${g.suspension}`)
if (!ghosts.length) process.exit(0)

const ids = new Set(ghosts.flatMap(g => [g.$id, g.tenantId].filter(Boolean)))
console.log(`\nSchlüssel, gegen die gesucht wird: ${[...ids].join(', ')}`)

// ── 2. Anhängendes einsammeln ──────────────────────────────────────────────
/** Pool-Tabellen mit communityId-Stempel (Datentür) + ihre Abhängigen. */
const POOL_TABLES = [
  'lesson_progress', 'enrollments', 'lessons', 'event_rsvps', 'events',
  'courses', 'pages', 'comments', 'community_posts', 'guest_authors',
  'community_branding', 'notifications', 'activities',
]
const CONTROL_TABLES = ['community_members', 'abuse_reports', 'invite_codes']

const found = { pool: {}, control: {} }
for (const tableId of POOL_TABLES) {
  const rows = []
  for (const id of ids) rows.push(...await list(pool, tableId, [Query.equal('communityId', id)]))
  // community_branding trägt die Community-Id als ROW-Id, nicht als Spalte.
  if (tableId === 'community_branding') {
    for (const id of ids) {
      const row = await pool.getRow({ databaseId: DB, tableId, rowId: id }).catch(() => null)
      if (row) rows.push(row)
    }
  }
  if (rows.length) found.pool[tableId] = [...new Map(rows.map(r => [r.$id, r])).values()]
}
for (const tableId of CONTROL_TABLES) {
  const rows = []
  for (const id of ids) {
    rows.push(...await list(control, tableId, [Query.equal('communityId', id)]))
    rows.push(...await list(control, tableId, [Query.equal('tenantId', id)]))
  }
  if (rows.length) found.control[tableId] = [...new Map(rows.map(r => [r.$id, r])).values()]
}

// Von den Beweisläufen angelegte Konten (Muster aus verify-community-suspension.mjs).
const ghostUsers = { pool: [], control: [] }
for (const [bucket, api] of [['pool', poolUsers], ['control', controlUsers]]) {
  const { users } = await api.list({ queries: [Query.limit(100)] }).catch(() => ({ users: [] }))
  ghostUsers[bucket] = users.filter(u => /^m13c?-.*@example\.test$/.test(u.email ?? ''))
}

console.log('\nAnhängende Zeilen:')
for (const [scope, tables] of Object.entries(found)) {
  for (const [tableId, rows] of Object.entries(tables)) console.log(`  ${scope}/${tableId}: ${rows.length}`)
}
console.log(`  pool/users: ${ghostUsers.pool.length}${ghostUsers.pool.length ? ` (${ghostUsers.pool.map(u => u.email).join(', ')})` : ''}`)
console.log(`  control/users: ${ghostUsers.control.length}${ghostUsers.control.length ? ` (${ghostUsers.control.map(u => u.email).join(', ')})` : ''}`)

if (!DELETE) {
  console.log('\n(Nur gelesen — mit --delete wird gelöscht.)')
  process.exit(0)
}

// ── 3. Löschen: Abhängiges zuerst, die Community zuletzt ───────────────────
console.log('\nLöschen …')
for (const tableId of POOL_TABLES) {
  for (const row of found.pool[tableId] ?? []) {
    await pool.deleteRow({ databaseId: DB, tableId, rowId: row.$id }).catch(e => console.log(`  ! pool/${tableId}/${row.$id}: ${e.message}`))
  }
  if (found.pool[tableId]) console.log(`  pool/${tableId}: ${found.pool[tableId].length} gelöscht`)
}
for (const tableId of CONTROL_TABLES) {
  for (const row of found.control[tableId] ?? []) {
    await control.deleteRow({ databaseId: DB, tableId, rowId: row.$id }).catch(e => console.log(`  ! control/${tableId}/${row.$id}: ${e.message}`))
  }
  if (found.control[tableId]) console.log(`  control/${tableId}: ${found.control[tableId].length} gelöscht`)
}
for (const u of ghostUsers.pool) await poolUsers.delete({ userId: u.$id }).catch(() => {})
for (const u of ghostUsers.control) await controlUsers.delete({ userId: u.$id }).catch(() => {})
console.log(`  users: ${ghostUsers.pool.length + ghostUsers.control.length} gelöscht`)
for (const g of ghosts) {
  await control.deleteRow({ databaseId: DB, tableId: 'communities', rowId: g.$id })
  console.log(`  communities/${g.host} gelöscht`)
}

const rest = await list(control, 'communities', [])
console.log(`\n✔ verbleibende Communities: ${rest.map(r => r.host).join(', ') || '(keine)'}`)
