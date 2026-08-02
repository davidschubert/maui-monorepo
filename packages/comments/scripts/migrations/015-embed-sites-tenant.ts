/**
 * Migration comments-015: `embed_sites.tenantId` + Unique-Umbau.
 *
 * WARUM: Der ESLint-Backstop der Datentür hat die letzte ungescopte Tabelle
 * des comments-Layers gefunden — im Pool teilten sich sonst ALLE Communities
 * EIN Embed-Register (Tenant B sieht/löscht die Embed-Hosts von Tenant A,
 * und die frame-ancestors-CSP wirkte quer über Mandanten). Das Embed-Gate
 * ist auf der Platform-App heute aus — das Loch war also noch nicht
 * erreichbar; jetzt ist es dicht, BEVOR das Feature dort aufmacht.
 *
 * Unique-Umbau nach der Pool-Regel (Memory pages-004): global-unique `host`
 * würde im Pool die Registrierung desselben Hosts durch zwei Mandanten
 * verhindern → Unique wird (tenantId, host). Alter Index wird gelöscht
 * (404 → skip, falls schon weg).
 *
 * Rein ADDITIV für den Silo-Betrieb ('' = Einzelbetrieb, Verhalten identisch).
 * Idempotent. Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer comments
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

const TABLE = 'embed_sites'
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

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

console.log(`Migration comments-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Column ${TABLE}.tenantId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('tenantId')

// Neuer Unique VOR dem Löschen des alten: so gibt es nie ein Fenster ohne
// Duplikat-Schutz. Bestand hat tenantId '' → (''‚ host) bleibt so eindeutig
// wie zuvor host allein.
await indexStep(`Unique-Index ${TABLE}.uq_tenant_host`, {
  tableId: TABLE, key: 'uq_tenant_host', type: TablesDBIndexType.Unique,
  columns: ['tenantId', 'host'],
})

try {
  // destruktiv-ok: uq_host wird durch uq_tenant_host ERSETZT (oben zuerst
  // angelegt) — es gibt nie ein Fenster ohne Duplikat-Schutz.
  await tablesDB.deleteIndex({ databaseId, tableId: TABLE, key: 'uq_host' })
  console.log(`✔ Alter Unique-Index ${TABLE}.uq_host entfernt`)
}
catch (error) {
  if (hasCode(error, 404)) console.log(`↷ ${TABLE}.uq_host schon weg`)
  else throw error
}

console.log('✔ Migration comments-015 fertig')
