/**
 * Migration comments-014: `comment_votes.tenantId`.
 *
 * WARUM: Beim Umbau auf die mandantensichere Datentür (core tenantDb) fiel auf,
 * dass die Stimmen-Tabelle bisher NUR über die Beziehung zum Kommentar gescopt
 * war — keine eigene Spalte. Damit gäbe es genau eine Tabelle, die nicht durch
 * die Tür kann, und genau eine Ausnahme von der Regel. Ausnahmen sind die
 * Stelle, an der eine Regel später stirbt: also bekommt die Tabelle die Spalte.
 *
 * Rein ADDITIV und ruhend: '' / fehlend = Silo-/Einzelbetrieb (comments-App
 * unverändert). Im Pool stempelt die Tür den Mandanten und filtert darauf.
 *
 * BESTAND: Zeilen ohne tenantId werden im Pool nicht mehr gefunden (fail-closed
 * — dieselbe Regel wie überall). Auf der Pool-Instanz existiert dafür heute
 * genau ein Mandant ohne Stimmen; die comments-App ist Einzelbetrieb und damit
 * nicht betroffen. Ein Backfill wäre also Theater.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer comments
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

const TABLE = 'comment_votes'
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
async function waitForColumn(key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: TABLE })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${key}" wurde nicht verfügbar`)
}

console.log(`Migration comments-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Column ${TABLE}.tenantId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('tenantId')
// Die Stimmen-Abfrage filtert userId + commentId + (neu) tenantId — der Index
// trägt genau diese Kombination, führend der Mandant.
await indexStep(`Index ${TABLE}.idx_tenant_user`, () => tablesDB.createIndex({
  databaseId, tableId: TABLE, key: 'idx_tenant_user', type: TablesDBIndexType.Key,
  columns: ['tenantId', 'userId'],
}))

console.log('✔ Migration comments-014 fertig')
