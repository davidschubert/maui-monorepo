/**
 * Migration studio-018: `tenants.openRegistration` — darf sich JEDER auf
 * dieser Community-Site ein Konto anlegen?
 *
 * Hintergrund (Audit-Befund S1, Davids Entscheidung 4 vom 2026-07-27): der
 * Einladungs-Code gehört zum GRÜNDEN einer Community, nicht zum Beitreten.
 * Die Register-Seite war deshalb eine Sackgasse — /login verlinkte sie, aber
 * ohne Code kam man nirgends hin. Ab jetzt entscheidet die Community selbst:
 * offene Registrierung (Default) oder „nur auf Einladung".
 *
 * Default AN und Bestand = AN: Appwrite backfillt Spalten-Defaults NICHT
 * (verifiziert bei `plan`/`audience`), Bestands-Rows lesen sich also als
 * `null`. Für dieses Feld ist das genau richtig — `null` heißt „nie etwas
 * entschieden", und wer nie etwas entschieden hat, betreibt weiter das
 * bisherige Verhalten (offen). Bewusster Gegensatz zu `audience` (studio-016),
 * das fail-CLOSED liest: dort hängt eine Datenschutzgrenze dran, hier eine
 * Produktentscheidung. Gelesen wird ausschließlich über
 * resolveTenantOpenRegistration() (shared/types/tenantRecord.ts).
 *
 * Rein ADDITIV (keine Spalte wird umgebaut, keine Row angefasst) — auf der
 * befüllten Prod-Instanz gefahrlos fahrbar. Idempotent (409 → skip).
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

console.log(`Migration studio-018 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Kein Index: das Feld wird IMMER zusammen mit der Host-Auflösung gelesen
// (eine Row, uq_host) und nie gefiltert — ein Index wäre toter Ballast.
await step('Column tenants.openRegistration', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'tenants', key: 'openRegistration', required: false, xdefault: true,
}))
await waitForColumn('tenants', 'openRegistration')

console.log('✔ Migration studio-018 fertig')
