/**
 * Migration 007: `comment_votes` — Table-Level `read(users)` entfernen.
 *
 * Voting ist nicht anonym, solange JEDER eingeloggte User per Web-SDK alle
 * Vote-Rows listen kann. Row-Security reicht: Rows tragen `read(user:self)`,
 * der Server liest ohnehin mit dem Admin-Client. Kein Realtime-Consumer
 * abonniert fremde Vote-Rows (Gesamtcheck 2026-07-02 verifiziert).
 *
 * IDEMPOTENT: updateTable setzt die Ziel-Permissions absolut — ein Re-Run
 * ist ein No-op. 404 (Table fehlt, z. B. App ohne comments-Daten) → Skip.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/007-votes-table-read.ts
 *
 * Benötigte Key-Scopes: tables.* (Migrations-Key, siehe A2).
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite'

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

console.log(`Migration 007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.updateTable({
    databaseId,
    tableId: 'comment_votes',
    name: 'Comment Votes',
    // read(users) fällt weg — nur noch create(users); Lesen läuft über
    // Row-Permissions (read(user:self)) bzw. den Server-Admin-Client.
    permissions: [Permission.create(Role.users())],
    rowSecurity: true,
  })
  console.log('✔ comment_votes: Table-Permissions = [create(users)] (read(users) entfernt)')
}
catch (error) {
  if (hasCode(error, 404)) {
    console.log('↷ comment_votes existiert nicht — nichts zu tun')
  }
  else {
    throw error
  }
}

console.log('Migration 007 abgeschlossen.')
