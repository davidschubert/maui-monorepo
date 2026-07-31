/**
 * Migration control-022: `sites` → `websites` — erster Schritt der Umbenennung
 * auf das Vokabular der Oberfläche (OPEN-ITEMS E8, Davids Entscheidung
 * 2026-07-30: die Kunden-Objekte heißen „Communities", das Betreiber-Register
 * heißt „Websites").
 *
 * WARUM DIESE TABELLE ZUERST: sie ist die kleinste (produktiv 2 Zeilen, nur im
 * Control Plane) und trägt keine Kundendaten — und sie ist damit die PROBE für
 * das Muster, das danach 19 Tabellen mit echten Kundenzeilen durchläuft.
 * Appwrite kann eine Tabelle nicht umbenennen, also: neue Tabelle anlegen,
 * Zeilen kopieren, Code umstellen, alte Tabelle löschen (separat, erst nach
 * einer Nacht ohne Auffälligkeiten).
 *
 * DIE ROW-ID WIRD MITGEGEBEN — das ist der gefährliche Teil des ganzen
 * Vorhabens, hier an zwei Zeilen geübt. Eine Appwrite-Row-Id ist der Wert, mit
 * dem andere Tabellen (und bei `tenants` später auch Site-Labels und jede
 * `tenantId` in jedem gepoolten Projekt) auf die Zeile zeigen. Wird sie beim
 * Kopieren neu vergeben, zeigen alle Verweise ins Leere — lautlos.
 *
 * IDEMPOTENT: Tabelle/Spalten/Indizes über 409, das Kopieren über eine
 * Existenzprüfung je Row-Id. Ein zweiter Lauf ändert nichts.
 *
 * NICHT umbenannt wird die Spalte `workspaceId` — sie zeigt auf `workspaces`,
 * und die verschwindet mit A6 ohnehin. Hier nur das, was auch bleibt.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { indexStep } from '../../../../scripts/migrations-lib/indexRetry.mts'

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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const OLD = 'sites'
const NEW = 'websites'

interface SiteLike {
  $id: string
  name: string
  slug: string
  projectId: string
  endpoint: string
  appUrl: string
  status: string
  healthStatus: string
  healthCheckedAt: string | null
  notes: string
  features: string
  workspaceId: string
}

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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-022 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── 1. Die neue Tabelle, Form 1:1 aus control-001 + control-004/006 ──────────
await step(`Table ${NEW}`, () => tablesDB.createTable({
  databaseId: db, tableId: NEW, name: 'Websites',
  permissions: [], // nur Server (Admin-Client) — wie das Original
  rowSecurity: false,
}))

await step(`Column ${NEW}.name`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'name', size: 100, required: true,
}))
await step(`Column ${NEW}.slug`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'slug', size: 64, required: true,
}))
await step(`Column ${NEW}.projectId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'projectId', size: 64, required: true,
}))
await step(`Column ${NEW}.endpoint`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'endpoint', size: 256, required: true,
}))
await step(`Column ${NEW}.appUrl`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'appUrl', size: 256, required: false, xdefault: '',
}))
await step(`Column ${NEW}.status`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'status', size: 24, required: false, xdefault: 'active',
}))
await step(`Column ${NEW}.healthStatus`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'healthStatus', size: 16, required: false, xdefault: 'unknown',
}))
await step(`Column ${NEW}.healthCheckedAt`, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: NEW, key: 'healthCheckedAt', required: false,
}))
await step(`Column ${NEW}.notes`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'notes', size: 1000, required: false, xdefault: '',
}))
await step(`Column ${NEW}.features`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'features', size: 1000, required: false, xdefault: '[]',
}))
await step(`Column ${NEW}.workspaceId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'workspaceId', size: 36, required: false, xdefault: '',
}))

await waitForColumns(NEW)

await indexStep(`Index ${NEW}.idx_slug (unique)`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW, key: 'idx_slug', type: TablesDBIndexType.Unique, columns: ['slug'],
}))
await indexStep(`Index ${NEW}.idx_status`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))
await indexStep(`Index ${NEW}.idx_workspace`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW, key: 'idx_workspace', type: TablesDBIndexType.Key, columns: ['workspaceId'],
}))

// ── 2. Zeilen kopieren — MIT ihrer Row-Id ────────────────────────────────────
const alt = await tablesDB.listRows<SiteLike>({
  databaseId: db, tableId: OLD, queries: ['{"method":"limit","values":[100]}'],
}).catch((error) => {
  if (hasCode(error, 404)) {
    console.log(`↷ Table ${OLD} existiert nicht mehr — Kopieren übersprungen`)
    return null
  }
  throw error
})

if (alt) {
  console.log(`  ${alt.total} Zeile(n) in ${OLD}`)
  for (const row of alt.rows) {
    const schon = await tablesDB.getRow({ databaseId: db, tableId: NEW, rowId: row.$id }).catch(() => null)
    if (schon) {
      console.log(`↷ Row ${row.$id} (${row.name}) — schon kopiert`)
      continue
    }
    await tablesDB.createRow({
      databaseId: db,
      tableId: NEW,
      // DIE ID IST DER PUNKT: nicht ID.unique(), sondern die alte.
      rowId: row.$id,
      data: {
        name: row.name,
        slug: row.slug,
        projectId: row.projectId,
        endpoint: row.endpoint,
        appUrl: row.appUrl ?? '',
        status: row.status ?? 'active',
        healthStatus: row.healthStatus ?? 'unknown',
        healthCheckedAt: row.healthCheckedAt ?? null,
        notes: row.notes ?? '',
        features: row.features ?? '[]',
        workspaceId: row.workspaceId ?? '',
      },
    })
    console.log(`✔ Row ${row.$id} (${row.name}) kopiert`)
  }

  // Gegenprobe: gleiche Anzahl, gleiche Ids.
  const neu = await tablesDB.listRows<SiteLike>({
    databaseId: db, tableId: NEW, queries: ['{"method":"limit","values":[100]}'],
  })
  const fehlend = alt.rows.filter(row => !neu.rows.some(n => n.$id === row.$id))
  if (fehlend.length > 0) {
    throw new Error(`Kopie unvollständig — fehlende Ids: ${fehlend.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe: ${neu.total} Zeile(n) in ${NEW}, alle Row-Ids erhalten`)
}

console.log('✔ Migration control-022 fertig')
console.log('  Die alte Tabelle `sites` bleibt bewusst stehen — sie wird separat')
console.log('  gelöscht (control-023), erst nachdem der neue Code eine Nacht lief.')
