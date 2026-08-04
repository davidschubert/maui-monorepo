/**
 * Migration analytics-002: Spalte `analytics_settings.enabled`.
 *
 * WARUM ES SIE GIBT (v2, 2026-08-04): die v1 kannte genau EINEN Weg zur
 * Messung — der Owner holt sich in Plausible eine eigene Site und trägt deren
 * Script-Id ein. Nur ist die Registrierung auf unserer Instanz zu (richtig so),
 * also war „Selbstbedienung" in Wahrheit „schreib David an". Die Plausible-CE
 * hat auch keine Sites-API (Enterprise-only, am Quellcode geprüft), mit der wir
 * die Site automatisch anlegen könnten.
 *
 * Deshalb: EINE Sammel-Site für alle Pool-Communities
 * (`pukalani.analytics.shared`), die Zahlen je Community kommen aus dem
 * Hostname-Filter der Stats-API. „Aktivieren" ist damit nur noch ein Schalter —
 * und der ist genau diese Spalte.
 *
 * ADDITIV und ohne Index: das Feld wird IMMER zusammen mit der einen Zeile des
 * Mandanten gelesen (uq_community) und nie gefiltert. `xdefault: false` heißt
 * für den Bestand „nicht aktiviert" — wer schon eine eigene Script-Id
 * hinterlegt hat, misst unverändert weiter, denn die eigene Id GEWINNT über den
 * Schalter (core/shared/analyticsScript.ts, `effectiveScriptId`).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer analytics
 */
import { Client, TablesDB } from 'node-appwrite'

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
/**
 * Auf GENAU die neue Spalte warten, nicht auf „alle verfügbar": die Tabelle
 * steht hier schon aus analytics-001, und ein Warten auf alle Spalten würde bei
 * einer künftigen dritten Migration mitlaufen, die gerade nebenan schreibt.
 */
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => c.key === key)
    if (column && column.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration analytics-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const cols = await existingColumnKeys('analytics_settings')

await columnStep('Column analytics_settings.enabled', 'enabled', cols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'analytics_settings', key: 'enabled', required: false, xdefault: false,
}))

await waitForColumn('analytics_settings', 'enabled')

console.log('✔ Migration analytics-002 fertig')
