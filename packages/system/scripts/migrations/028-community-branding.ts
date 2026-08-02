/**
 * Migration system-028: Table `community_branding` — der SPIEGEL der
 * Community-Farbwahl im Runtime-Projekt (OPEN-ITEMS D6).
 *
 * EINE Row pro Community, rowId = `communities.$id` (= `useSiteId()`), Inhalt
 * = die drei Felder `theme`/`variant`/`neutral`. Geschrieben wird sie
 * ausschliesslich server-seitig (core/server/utils/communityBrandingMirror.ts)
 * direkt nach dem bestätigten Schreibvorgang im Control Plane; gelesen wird
 * sie NUR per Realtime vom Browser. Vertrag + Begründung, warum das nicht in
 * `app_config` gehört: packages/core/shared/communityBranding.ts.
 *
 * PERMISSIONS wie `app_config` (system-005) und `custom_themes` (system-013):
 * `read(any)`, kein write — Realtime liefert nur, was der Client lesen darf,
 * und die Werte stehen ohnehin als data-theme/data-variant/data-neutral im
 * <html> jeder Seite dieser Community. rowSecurity: false, weil das
 * Lese-Recht an der Tabelle hängt.
 *
 * DAS HEISST AUFZÄHLBAR — geprüft und akzeptiert (2026-08-03): ein anonymer
 * Client kann die Tabelle LISTEN, nicht nur seine Row abonnieren. Tragbar ist
 * das genau deshalb, weil hier nur Farb-Tokens und eine undurchsichtige Row-Id
 * liegen. NIE eine Spalte mit Name, Host oder sonst etwas Identifizierendem
 * dazunehmen — Abwägung: core/shared/communityBranding.ts, Wächter:
 * Abschnitt 12 in packages/onboarding/scripts/verify-site-branding.mjs.
 *
 * KEINE INDIZES, und das ist kein Vergessen: die Tabelle wird ausschliesslich
 * über die rowId angesprochen (`upsertRow`, `Channel…row(<id>)`) — es gibt
 * keine Abfrage, die einen Index bräuchte. Damit entfällt hier auch der
 * `indexStep`-Retry (der ist Pflicht, sobald ein Index dazukommt).
 *
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
 */
import { Client, Permission, Role, TablesDB } from 'node-appwrite'

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
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-028 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table community_branding', () => tablesDB.createTable({
  databaseId: db,
  tableId: 'community_branding',
  name: 'Community Branding (Spiegel)',
  // read: any → der Browser darf die Row seiner Community abonnieren.
  // Kein write: geschrieben wird nur mit dem Server-Key.
  permissions: [Permission.read(Role.any())],
  rowSecurity: false,
}))

// 32 Zeichen = dieselbe Grenze wie in den Zod-Schemas beider Schreibwege
// (branding.patch.ts / control/community/branding.post.ts). '' ist ein
// gültiger Wert und heisst „keine eigene Wahl" — deshalb nicht required.
for (const key of ['theme', 'variant', 'neutral']) {
  await step(`Column community_branding.${key}`, () => tablesDB.createVarcharColumn({
    databaseId: db, tableId: 'community_branding', key, size: 32, required: false, xdefault: '',
  }))
}

await waitForColumns('community_branding')

console.log('✔ Migration system-028 fertig')
