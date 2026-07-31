/**
 * Migration courses-004: courses.entitlementFeature löschen — feature→product
 * ZUSAMMENZIEHEN (E11). Gegenstück zu courses-003: seit Etappe B liest und
 * schreibt der Code nur noch `entitlementProduct`; David hat die
 * Beobachtungsnacht erlassen (2026-07-30). Läuft NACH dem Code-Deploy.
 *
 * IDEMPOTENT über 404 (Spalte oder Tabelle weg = nichts zu tun).
 *
 *   pnpm migrate --app <app> --layer courses
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

console.log(`Migration courses-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  // destruktiv-ok: E11-Zusammenziehen — entitlementProduct (courses-003,
  // backfilled) ist seit Etappe B die einzige gelesene/geschriebene Spalte.
  await tablesDB.deleteColumn({ databaseId, tableId: 'courses', key: 'entitlementFeature' })
  console.log('✔ Column courses.entitlementFeature gelöscht')
}
catch (error) {
  if (hasCode(error, 404)) console.log('↷ Column courses.entitlementFeature (schon weg)')
  else throw error
}

console.log('✔ Migration courses-004 fertig')
