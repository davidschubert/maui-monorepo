/**
 * Migration 008: `comments` — Lese-Sichtbarkeit von der Table auf die Rows.
 *
 * Vorher: Table-`read(any)` → JEDE Row (auch status=hidden) war per Roh-REST/
 * Web-SDK lesbar; der hidden-Filter existierte nur in der Nuxt-Route.
 * Nachher: Table nur noch `create(users)`; nicht-hidden Rows tragen
 * `read("any")` als ROW-Permission (Gast-Realtime funktioniert darüber weiter),
 * hidden Rows verlieren sie → per REST unlesbar.
 *
 * Der Moderations-Flow hält das aktuell: Ausblenden entzieht `read("any")`
 * (zweiphasig, damit das Status-Event Gäste noch erreicht), Wiederherstellen
 * setzt es zurück (admin/comments/[id]/status.patch).
 *
 * IDEMPOTENT: updateTable setzt absolut; der Row-Backfill prüft je Row den
 * Zielzustand und schreibt nur bei Abweichung.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/008-comments-row-read.ts
 *
 * Benötigte Key-Scopes: tables.*, rows.* (Migrations-Key, siehe A2).
 */
import { Client, TablesDB, Permission, Role, Query, type Models } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY. Empfohlen: separater Migrations-Key (Konzept A2).')
}

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

const READ_ANY = Permission.read(Role.any())
type CommentRow = Models.Row & { status?: string }

console.log(`Migration 008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// 1) Table-Permissions: read(any) fällt weg
try {
  await tablesDB.updateTable({
    databaseId,
    tableId: 'comments',
    name: 'Comments',
    permissions: [Permission.create(Role.users())],
    rowSecurity: true,
  })
  console.log('✔ comments: Table-Permissions = [create(users)] (read(any) entfernt)')
}
catch (error) {
  if (hasCode(error, 404)) {
    console.log('↷ comments existiert nicht — nichts zu tun')
    process.exit(0)
  }
  throw error
}

// 2) Row-Backfill: nicht-hidden → read(any) sicherstellen; hidden → entfernen
let updated = 0
let skipped = 0
let cursor: string | undefined
for (;;) {
  const res = await tablesDB.listRows<CommentRow>({
    databaseId,
    tableId: 'comments',
    queries: [Query.limit(200), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
  })
  for (const row of res.rows) {
    const wantsReadAny = row.status !== 'hidden'
    const hasReadAny = row.$permissions.includes(READ_ANY)
    if (wantsReadAny === hasReadAny) {
      skipped++
      continue
    }
    const permissions = wantsReadAny
      ? [...row.$permissions, READ_ANY]
      : row.$permissions.filter(p => p !== READ_ANY)
    await tablesDB.updateRow({ databaseId, tableId: 'comments', rowId: row.$id, permissions })
    updated++
  }
  if (res.rows.length < 200) break
  cursor = res.rows.at(-1)!.$id
}

console.log(`✔ Row-Backfill: ${updated} aktualisiert, ${skipped} bereits korrekt`)
console.log('Migration 008 abgeschlossen.')
