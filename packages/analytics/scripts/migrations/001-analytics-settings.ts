/**
 * Migration analytics-001: Table analytics_settings.
 *
 * EINE Row je Community (Pool, `communityId` = tenants.$id) bzw. EINE Row je
 * Instanz (Silo/Einzelbetrieb, `communityId` = ''). Der Unique-Index liegt
 * deshalb auf `communityId` allein — der Schlüssel IST hier der Mandant, damit
 * ist die Pool-Unique-Regel erfüllt (tenant-RELATIVE Schlüssel brauchen die
 * Spalte dazu; dieser besteht nur aus ihr).
 *
 * Gelesen wird die Zeile server-seitig über die Datentür mit der
 * Operator-Klinke (Gäste haben keine Session, die Zeile braucht deshalb KEIN
 * öffentliches Leserecht); geschrieben nur über PATCH /api/analytics/settings.
 * Row-Permissions setzt die Datentür (Pool: read(label:<communityId>)).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer analytics
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
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration analytics-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table analytics_settings', () => tablesDB.createTable({
  databaseId, tableId: 'analytics_settings', name: 'Analytics Settings', permissions: [], rowSecurity: true,
}))

const cols = await existingColumnKeys('analytics_settings')

// Mandanten-Spalte wie in jedem gepoolten Layer. Default '' = Einzelbetrieb;
// den Wert stempelt im Pool die Datentür, nie der Aufrufer.
await columnStep('Column analytics_settings.communityId', 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'analytics_settings', key: 'communityId', size: 64, required: false, xdefault: '',
}))
// `pa-` + bis zu 80 Zeichen (core/shared/analyticsScript.ts) — 128 lässt Luft,
// ohne dass die Spalte je zum Ablageort für eine ganze URL taugt.
await columnStep('Column analytics_settings.plausibleScriptId', 'plausibleScriptId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'analytics_settings', key: 'plausibleScriptId', size: 128, required: false, xdefault: '',
}))

await waitForColumns('analytics_settings')

// EINE Zeile je Mandant — der Unique-Index ist die Garantie hinter dem
// „suchen, sonst anlegen" der PATCH-Route: ein Doppelklick kann keine zweite
// Zeile erzeugen, aus der später die falsche gelesen würde.
await indexStep('Index analytics_settings.uq_community', {
  tableId: 'analytics_settings', key: 'uq_community', type: TablesDBIndexType.Unique, columns: ['communityId'],
})

console.log('✔ Migration analytics-001 fertig')
