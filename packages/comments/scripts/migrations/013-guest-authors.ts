/**
 * Migration comments-013: Gast-Kommentare (Embed E4, Task 20). Zwei Teile:
 *
 *  1. `comments.authorKind` (enum user|guest, Default 'user') — markiert eine
 *     Row als Gast-Beitrag. Bestandskommentare bleiben 'user'. Die Kommentar-
 *     Row ist read(any) (weltweit lesbar via REST/Realtime) — deshalb steht
 *     hier NIE eine E-Mail, nur der frei gewählte Anzeigename (authorName).
 *
 *  2. `guest_authors` — die Kontaktdaten der Gäste (Name, E-Mail, IP-Hash),
 *     verknüpft per commentId. NUR admin/moderator dürfen lesen (Role.label,
 *     KEIN read(any)) — für Moderation/Spam-Abwehr/DSGVO. Schreiben läuft
 *     server-seitig über den Admin-Client (POST /api/comments/guest). Die
 *     E-Mail verlässt damit nie den geschützten Server-/Operator-Raum.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer comments
 */
import { Client, Permission, Role, TablesDB, TablesDBIndexType } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration comments-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1. comments.authorKind ──────────────────────────────────────────────────
await step('Column comments.authorKind', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'comments', key: 'authorKind', elements: ['user', 'guest'], required: false, xdefault: 'user',
}))

// ── 2. guest_authors (nur Operatoren lesen — enthält die E-Mail) ────────────
const OPERATOR_READ = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
await step('Table guest_authors', () => tablesDB.createTable({
  databaseId, tableId: 'guest_authors', name: 'Guest Authors', rowSecurity: false, permissions: OPERATOR_READ,
}))
await step('Column guest_authors.commentId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'guest_authors', key: 'commentId', size: 36, required: true,
}))
await step('Column guest_authors.name', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'guest_authors', key: 'name', size: 80, required: true,
}))
await step('Column guest_authors.email', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'guest_authors', key: 'email', size: 254, required: true,
}))
// Salted-freier SHA-256 der IP: korreliert Wiederholungstäter ohne die IP zu speichern.
await step('Column guest_authors.ipHash', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'guest_authors', key: 'ipHash', size: 64, required: false, xdefault: '',
}))
// Pool-Mandant (spiegelt comments.tenantId): '' = Silo/Einzelbetrieb.
await step('Column guest_authors.tenantId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'guest_authors', key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('guest_authors', 'commentId')
await waitForColumn('guest_authors', 'tenantId')
await step('Index guest_authors.idx_comment', () => tablesDB.createIndex({
  databaseId, tableId: 'guest_authors', key: 'idx_comment', type: TablesDBIndexType.Key, columns: ['commentId'],
}))
await step('Index guest_authors.idx_tenant', () => tablesDB.createIndex({
  databaseId, tableId: 'guest_authors', key: 'idx_tenant', type: TablesDBIndexType.Key, columns: ['tenantId'],
}))

console.log('✔ Migration comments-013 fertig')
