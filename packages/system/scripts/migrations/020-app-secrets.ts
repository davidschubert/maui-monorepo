/**
 * Migration system-020: Table `app_secrets` — server-only Laufzeit-Werte
 * (Audit-Befund N2).
 *
 * WARUM eine EIGENE Tabelle: `app_config` ist seit system-005 Table-read(any)
 * — bewusst, denn Config-Flags und Theme-Live-Propagation hängen daran
 * (Realtime für Gäste). Table-Permissions vererben auf ALLE Rows, und
 * rowSecurity würde nur ZUSÄTZLICHE Rechte geben, keine wegnehmen. Eine
 * „geheime Row" in app_config ist also unmöglich. Deshalb: neue Tabelle mit
 * LEEREN Permissions (kein read für irgendwen) — erreichbar ausschließlich
 * über den Admin-Client (API-Key). Kein Realtime-Bedarf: das signierte
 * Entitlement-Dokument hat KEINEN Client-Leser (K5-Analyse).
 *
 * Inhalt heute: `entitlements` — das signierte Dokument der Site
 * (base64url(payload).base64url(sig)), vorher app_config.entitlements
 * (system-019). Die Migration KOPIERT den Wert; die Altspalte bleibt stehen
 * (additiv/Welle-fähig, Code n-1 läuft weiter). Der Code liest ab sofort
 * zuerst hier (2-Wege-Read mit Fallback auf die Altspalte) und LEERT die
 * Altspalte beim nächsten Pull-Zyklus.
 *
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
 *
 * Benötigte Key-Scopes: tables.*, columns.*, rows.* (Migrations-Key).
 */
import { Client, TablesDB, type Models } from 'node-appwrite'

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
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-020 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// permissions: [] → NIEMAND darf lesen (auch keine angemeldeten User);
// rowSecurity: false → es gibt keine Row-Ausnahmen. Nur der API-Key kommt ran.
await step('Table app_secrets', () => tablesDB.createTable({
  databaseId, tableId: 'app_secrets', name: 'App Secrets', permissions: [], rowSecurity: false,
}))

await step('Column app_secrets.entitlements', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'app_secrets', key: 'entitlements', size: 4000, required: false, xdefault: '',
}))

await waitForColumns('app_secrets')

// Wert aus der Altspalte übernehmen (falls vorhanden) — der Pull würde ihn
// zwar ohnehin neu holen, aber so gilt last-known-good ab Sekunde eins.
let carried = ''
try {
  const legacy = await tablesDB.getRow<Models.Row & { entitlements?: string }>({
    databaseId, tableId: 'app_config', rowId: 'global',
  })
  carried = typeof legacy.entitlements === 'string' ? legacy.entitlements : ''
}
catch (error) {
  if (hasCode(error, 404)) console.log('↷ app_config/global existiert nicht — nichts zu übernehmen')
  else throw error
}

try {
  await tablesDB.createRow({
    databaseId, tableId: 'app_secrets', rowId: 'global', data: { entitlements: carried },
  })
  console.log(`✔ Row app_secrets/global (${carried ? 'Dokument übernommen' : 'leer'})`)
}
catch (error) {
  if (!hasCode(error, 409)) throw error
  // Row existiert schon: nur befüllen, wenn sie noch leer ist und die
  // Altspalte etwas trägt — ein neuerer Pull-Wert wird NIE überschrieben.
  const current = await tablesDB.getRow<Models.Row & { entitlements?: string }>({
    databaseId, tableId: 'app_secrets', rowId: 'global',
  })
  if (!current.entitlements && carried) {
    await tablesDB.updateRow({
      databaseId, tableId: 'app_secrets', rowId: 'global', data: { entitlements: carried },
    })
    console.log('✔ Row app_secrets/global nachbefüllt (war leer)')
  }
  else {
    console.log('↷ Row app_secrets/global (existiert bereits)')
  }
}

console.log('✔ Migration system-020 fertig')
