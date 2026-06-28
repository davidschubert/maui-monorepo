/**
 * Migration 005: Thread-Felder rootId/depth + editedAt.
 *
 * - rootId: $id des Top-Level-Vorfahren (null bei Top-Level) → erlaubt künftig
 *   Subtree-Queries je Thread.
 * - depth:  Verschachtelungstiefe (0 = Top-Level) → maxDepth-Enforcement.
 * - editedAt: gesetzt beim Bearbeiten → echter „bearbeitet"-Indikator
 *   (statt des von Votes/Moderation gebumpten $updatedAt).
 *
 * Additiv + idempotent (409 → skip). Schema läuft mit dem Migrations-Key,
 * der Backfill bestehender Rows mit dem Runtime-Key (rows.write — Key-Trennung A2).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/005-thread-fields.ts
 */
import { Client, TablesDB, TablesDBIndexType, Query, type Models } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const migrationsKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
const runtimeKey = process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !migrationsKey || !runtimeKey) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

interface CommentRow extends Models.Row {
  parentId: string | null
  rootId: string | null
  depth: number
}

const mig = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(migrationsKey))
const rt = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(runtimeKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) { console.log(`↷ ${label} (existiert bereits)`); return }
    throw error
  }
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await mig.listColumns({ databaseId: databaseId!, tableId })
    if (columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration 005 (thread fields) gegen ${endpoint} / DB ${databaseId}`)

// --- Schema (Migrations-Key) ------------------------------------------------
await step('Column comments.rootId', () => mig.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'rootId', size: 255, required: false,
}))
await step('Column comments.depth', () => mig.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'depth', required: false, min: 0, xdefault: 0,
}))
await step('Column comments.editedAt', () => mig.createDatetimeColumn({
  databaseId, tableId: 'comments', key: 'editedAt', required: false,
}))

await waitForColumns('comments')

await step('Index comments.root', () => mig.createIndex({
  databaseId, tableId: 'comments', key: 'root', type: TablesDBIndexType.Key, columns: ['rootId'],
}))

// --- Backfill (Runtime-Key, rows.write) -------------------------------------
const all: CommentRow[] = []
for (let offset = 0; ; offset += 100) {
  const res = await rt.listRows<CommentRow>({
    databaseId, tableId: 'comments', queries: [Query.limit(100), Query.offset(offset)],
  })
  all.push(...res.rows)
  if (res.rows.length < 100) break
}
const byId = new Map(all.map(c => [c.$id, c]))

/** Top-Level-Vorfahr ($id) + Tiefe aus der parentId-Kette (zyklen-sicher). */
function resolve(c: CommentRow): { rootId: string | null, depth: number } {
  if (!c.parentId) return { rootId: null, depth: 0 }
  let cur = c
  let depth = 0
  const seen = new Set<string>()
  while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.$id)) {
    seen.add(cur.$id)
    cur = byId.get(cur.parentId)!
    depth++
  }
  return { rootId: cur.$id, depth }
}

let updated = 0
for (const c of all) {
  const { rootId, depth } = resolve(c)
  // Nur schreiben, wenn sich etwas ändert (idempotenter Re-Run)
  if (c.rootId === rootId && c.depth === depth) continue
  await rt.updateRow({ databaseId, tableId: 'comments', rowId: c.$id, data: { rootId, depth } })
  updated++
}
console.log(`✔ Backfill: ${all.length} Kommentare geprüft, ${updated} aktualisiert`)
console.log('Migration 005 abgeschlossen.')
