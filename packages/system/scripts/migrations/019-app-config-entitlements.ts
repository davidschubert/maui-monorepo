/**
 * Migration system-019: app_config.entitlements — das signierte Entitlement-
 * Dokument der Site (F3/M8-Vorbereitung), roh gespeichert
 * (base64url(payload).base64url(sig)).
 *
 * ÜBERHOLT von system-020 (Audit-Befund N2): app_config ist Table-read(any)
 * (system-005), das Dokument war damit für JEDEN anonym lesbar. Es lebt jetzt
 * in `app_secrets`. Diese Spalte bleibt vorerst stehen (Welle-fähig, Code n-1
 * liest sie noch); der Pull leert sie. Sie zu DROPPEN ist Sache einer
 * Aufräum-Migration, NACHDEM alle Instanzen neuen Code fahren.
 *
 * Idempotent (Vorab-Check + 409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
 */
import { Client, Query, TablesDB } from 'node-appwrite'

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
/**
 * app_config ist am utf8mb4-Zeilenbudget von MariaDB angekommen — Appwrite
 * prüft die Größe VOR der Duplikat-Erkennung und beantwortet ein erneutes
 * createColumn dann mit 400 `column_limit_exceeded` statt 409. Ohne diesen
 * Vorab-Check ist die Migration NICHT mehr idempotent (lokal erwischt, N2).
 */
async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    // Query.limit ist PFLICHT (Falle aus events-006, nachgezogen 2026-08-02):
    // ohne explizites Limit liefert listColumns 25 Spalten, und app_config
    // wächst mit jedem Flag. Eine abgeschnittene Liste meldet "Spalte fehlt" —
    // createColumn antwortet dann 400 column_limit_exceeded statt 409, und
    // genau die 409-Abkürzung ist die Idempotenz dieser Migration.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    return columns.some(column => column.key === key)
  }
  catch {
    return false
  }
}

console.log(`Migration system-019 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

if (await columnExists('app_config', 'entitlements')) {
  console.log('↷ Column app_config.entitlements (existiert bereits)')
}
else {
  try {
    await tablesDB.createVarcharColumn({
      databaseId, tableId: 'app_config', key: 'entitlements', size: 4000, required: false, xdefault: '',
    })
    console.log('✔ Column app_config.entitlements')
  }
  catch (error) {
    if (hasCode(error, 409)) console.log('↷ Column app_config.entitlements (existiert bereits)')
    else throw error
  }
}

console.log('✔ Migration system-019 fertig')
