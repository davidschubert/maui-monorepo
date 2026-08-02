/**
 * Migration system-021: `tenantId` auf `activities` (Arbeitsliste C1b).
 *
 * WARUM: der Activity-Feed (packages/activity) geht durch die mandantensichere
 * Datentür (core tenantDb) und wird damit pool-fähig. Die Tür filtert und
 * stempelt über die tenantId-Spalte — ohne Spalte keine Tür (Muster
 * posts-004/events-006/courses-002). Die Table gehört system (A14), die
 * UI-Welt dem activity-Layer, geschrieben wird über den Core-Vertrag
 * recordActivity() — der stempelt ab jetzt Mandant UND tenant-genamete
 * Row-Permissions (Role.label(siteId) im Pool statt Role.users()).
 *
 * BESTANDSZEILEN bekommen bewusst KEINEN Wert (xdefault ''):
 *  - Silo-Instanzen (comments, photos, help, marketing, portfolio, control):
 *    dort ist `tenant` null, die Tür scopet nicht, `rowBelongsToTenant` gibt
 *    jede Zeile frei. '' ist der einzig ehrliche Wert — „gehört keinem
 *    Mandanten, weil es keine gibt". Eine erfundene Id wäre eine Behauptung
 *    über eine Zugehörigkeit, die es auf diesen Instanzen nicht gibt.
 *  - Pool-Instanz (platform): dort SIND Bestandszeilen da (recordActivity läuft
 *    aus core/comments/posts/events/courses), aber sie sind nicht nachträglich
 *    zuzuordnen, ohne für jede Zeile ihr Objekt nachzuschlagen. Sie werden im
 *    Pool unsichtbar (fail-closed, dieselbe Regel wie posts-004/events-006).
 *    Das ist hier folgenlos: `activity` steht NICHT in apps/platform/
 *    site.manifest.ts, es gibt dort also keinen Feed, der sie zeigen könnte.
 *    Wer den Feed dort einschaltet, entscheidet dann bewusst: Backfill über die
 *    Objekte oder Alt-Einträge wegwerfen.
 *
 * INDEX: `idx_tenant` (tenantId) trägt die Listen-Abfrage des Feeds
 * (Query.equal('tenantId') + orderDesc($createdAt) + Cursor). Ein Composite mit
 * $createdAt gibt es bewusst nicht — auf interne Attribute legt dieses Projekt
 * nirgends Indizes. `idx_actor` (GDPR, mandantenübergreifend) und `idx_object`
 * (Cascade per global eindeutiger Row-Id) bleiben ohne tenantId: beide Pfade
 * arbeiten bewusst über Mandanten hinweg bzw. über einen global eindeutigen
 * Schlüssel.
 *
 * UNIQUE-INDIZES: keine — `activities` ist ein Ereignis-Log ohne
 * Eindeutigkeits-Schlüssel. Die Pool-Unique-Regel (tenant-RELATIVE Schlüssel
 * brauchen tenantId, Row-Id-basierte nicht) greift hier gar nicht.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer system
 *
 * Betroffene Prod-Instanzen: ALLE (system ist implizites Fundament jeder App) —
 * comments, photos, platform, control, help, marketing, portfolio. Reihenfolge
 * unkritisch: die Spalte ist additiv und ruhend, alter Code ignoriert sie.
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const TABLE_ID = 'activities'

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
    // Query.limit ist PFLICHT (Falle aus events-006): der listColumns-Default
    // (25) würde die neue Spalte auf breiten Tabellen nie zeigen.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration system-021 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const table = await tablesDB.getTable({ databaseId, tableId: TABLE_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!table) {
  console.log(`↷ Table ${TABLE_ID} fehlt — system-014 zuerst ausführen`)
  process.exit(0)
}

await step(`Column ${TABLE_ID}.tenantId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE_ID, key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn(TABLE_ID, 'tenantId')

await indexStep(`Index ${TABLE_ID}.idx_tenant`, {
  tableId: TABLE_ID, key: 'idx_tenant',
  type: TablesDBIndexType.Key, columns: ['tenantId'],
})

console.log('✔ Migration system-021 fertig')
