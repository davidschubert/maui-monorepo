/**
 * Migration 006: verwaiste Antworten reparieren (Datenreparatur, kein Schema).
 *
 * Der 005-Backfill machte Antworten, deren Parent hart gelöscht war, zu
 * Selbst-Roots (rootId = eigene $id, depth 0) — parentId blieb aber stehen.
 * Solche Rows liefert die Listen-Route NIE aus (kein Top-Level wegen
 * parentId, kein Subtree-Treffer wegen Selbst-Root), total zählt sie aber
 * mit → der „Alle N Kommentare laden"-Button verspricht mehr, als je kommt.
 *
 * Reparatur: Waisen (parentId ohne existierende Parent-Row) werden echtes
 * Top-Level (parentId/rootId → null, depth 0); ihre Subtrees werden auf den
 * neuen Root umgehängt. Idempotent — ohne Waisen ist der Lauf ein No-op.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/006-orphan-replies.ts
 *
 * Läuft komplett mit dem Runtime-Key (rows.write, keine Schema-Änderung).
 */
import { Client, TablesDB, Query, type Models } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const runtimeKey = process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !runtimeKey) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

interface CommentRow extends Models.Row {
  parentId: string | null
  rootId: string | null
  depth: number
}

const rt = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(runtimeKey))

console.log(`Migration comments-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const all: CommentRow[] = []
for (let offset = 0; ; offset += 100) {
  const res = await rt.listRows<CommentRow>({
    databaseId, tableId: 'comments', queries: [Query.limit(100), Query.offset(offset)],
  })
  all.push(...res.rows)
  if (res.rows.length < 100) break
}
const byId = new Map(all.map(c => [c.$id, c]))

// 1) Waisen: parentId gesetzt, Parent-Row existiert nicht mehr → Top-Level
const orphans = all.filter(c => c.parentId && !byId.has(c.parentId))
for (const orphan of orphans) {
  await rt.updateRow({
    databaseId, tableId: 'comments', rowId: orphan.$id,
    data: { parentId: null, rootId: null, depth: 0 },
  })
  console.log(`✔ Waise → Top-Level: ${orphan.$id} (parent ${orphan.parentId} fehlt)`)
  orphan.parentId = null
  orphan.rootId = null
  orphan.depth = 0
}

// 2) rootId/depth für alle verbliebenen Antworten neu ableiten (repariert
// Subtrees unter beförderten Waisen; unverändert = kein Write, idempotent)
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
  if (c.rootId === rootId && c.depth === depth) continue
  await rt.updateRow({ databaseId, tableId: 'comments', rowId: c.$id, data: { rootId, depth } })
  updated++
}

console.log(`✔ ${all.length} Kommentare geprüft — ${orphans.length} Waisen befördert, ${updated} rootId/depth aktualisiert`)
console.log('Migration comments-006 abgeschlossen.')
