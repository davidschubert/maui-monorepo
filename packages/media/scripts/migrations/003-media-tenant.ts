/**
 * Migration media-003: `tenantId` auf `media_items` (Arbeitsliste C1b).
 *
 * WARUM: media geht durch die mandantensichere Datentür (core tenantDb) und
 * wird damit pool-fähig. Die Tür filtert und stempelt über die tenantId-Spalte
 * — ohne Spalte keine Tür (Muster posts-004/events-006/courses-002). Der
 * Rechte-Gate (`requireSitePermission`, S3) und die Row-/File-Sichtbarkeit
 * (media-002) stehen schon; sie regeln WER, nicht WESSEN.
 *
 * BESTANDSZEILEN bekommen bewusst KEINEN Wert (xdefault ''): beide Instanzen
 * mit media (photos, comments) sind heute SILO. Dort ist `tenant` null, die Tür
 * scopet nicht und `rowBelongsToTenant` gibt jede Zeile frei — '' ist also der
 * einzig ehrliche Wert: „gehört keinem Mandanten, weil es keine gibt". Eine
 * erfundene Id wäre eine Behauptung über eine Zugehörigkeit, die es auf diesen
 * Instanzen nicht gibt, und würde beim späteren Pool-Umzug (Silo → Pool) mit
 * der echten Site-Id kollidieren. Im Pool ist Bestand ohne tenantId unsichtbar
 * (fail-closed, dieselbe Regel wie posts-004/events-006/courses-002) — auf der
 * Pool-Instanz (platform) existiert `media_items` heute gar nicht, weil media
 * nicht in ihrem site.manifest steht.
 *
 * INDEX: `idx_tenant_published_order` (tenantId + published + sortOrder) trägt
 * die einzige Listen-Abfrage des Layers (Galerie: published, nach sortOrder),
 * jetzt mit dem Mandanten führend. Der alte `idx_published_order` (media-001)
 * BLEIBT: im Silo läuft die Liste ohne tenantId-Filter weiter über ihn.
 *
 * UNIQUE-INDIZES: keine — weder neu noch bestehend. `media_items` hat keinen
 * von Menschen gewählten Schlüssel (kein Slug, kein Host); Titel dürfen sich
 * wiederholen, `fileId` ist eine global eindeutige Storage-Id. Damit greift die
 * Pool-Unique-Regel hier gar nicht erst (sie gilt nur für tenant-RELATIVE
 * Schlüssel — CLAUDE.md).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer media
 *
 * Betroffene Prod-Instanzen: photos und comments (die einzigen mit media im
 * Manifest). Reihenfolge unkritisch — die Spalte ist additiv und ruhend: alter
 * Code ignoriert sie, neuer Code stempelt sie, gefiltert wird erst im Pool.
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

const TABLE_ID = 'media_items'

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

console.log(`Migration media-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const table = await tablesDB.getTable({ databaseId, tableId: TABLE_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!table) {
  console.log(`↷ Table ${TABLE_ID} fehlt — media-001 zuerst ausführen`)
  process.exit(0)
}

await step(`Column ${TABLE_ID}.tenantId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE_ID, key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn(TABLE_ID, 'tenantId')

// Mit Cache-Anstoß (F19): genau dieser Index starb am 2026-08-02 in der CI —
// 23 Versuche, keine Bewegung, weil das gecachte Collection-Dokument die
// Spalte dauerhaft auf 'processing' zeigte. Warten hilft dagegen nie.
await indexStep(`Index ${TABLE_ID}.idx_tenant_published_order`, {
  tableId: TABLE_ID, key: 'idx_tenant_published_order',
  type: TablesDBIndexType.Key, columns: ['tenantId', 'published', 'sortOrder'],
})

console.log('✔ Migration media-003 fertig')
