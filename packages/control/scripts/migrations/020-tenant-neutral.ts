/**
 * Migration control-020: `tenants.neutral` — die NEUTRAL-PALETTE gehört der
 * Community (Davids Entscheidung vom 2026-07-29, Rest von OPEN-ITEMS B5).
 *
 * Seit B5 gewinnt auf einem Mandanten-Host die Farbwelt der Community
 * (`tenants.theme/variant`). Die Neutral-Palette (`data-neutral`, die gedeckte
 * Grau-Tönung) blieb dabei Besucher-Wahl — nicht aus Überzeugung, sondern weil
 * es dafür keine Community-Einstellung GAB. Das hier ist die Einstellung.
 *
 * EINE Spalte, exakt nach dem Muster von `theme`/`variant` (control-016):
 *   - varchar(32), NICHT required, Default `''`
 *   - `''` = „keine eigene Wahl" → es gilt, was die Instanz zeigt (die
 *     Registry-Voreinstellung bzw. die getönte Ramp des aktiven Themes).
 *     Genau wie `tenants.theme = ''` auf `app_config.themeSettings` zurückfällt.
 *   - Bestands-Rows: Appwrite backfillt Spalten-Defaults NICHT — sie lesen
 *     `undefined`/`null`. Deshalb liest der Resolver den Wert nie direkt,
 *     sondern über `row.neutral && isSafeThemeToken(row.neutral)` (fehlender
 *     Wert ⇒ kein Branding-Feld ⇒ Besucher-Verhalten wie bisher). KEIN Backfill
 *     nötig, kein Deploy-Moment, in dem irgendjemand umgefärbt wird.
 *
 * Kein Index: gesucht wird `tenants` immer über den Host (uq_host); die
 * Palette wird nur MITGELESEN, nie gefiltert.
 *
 * Idempotent (409 → skip), nach der Column-Anlage auf 'available' gepollt.
 * Aufruf über den Runner:
 *   pnpm migrate --app control --layer control
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

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration control-020 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column tenants.neutral', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'neutral', size: 32, required: false, xdefault: '',
}))
await waitForColumn('tenants', 'neutral')

console.log('✔ Migration control-020 fertig')
