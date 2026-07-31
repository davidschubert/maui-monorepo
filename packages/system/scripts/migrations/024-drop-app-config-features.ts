/**
 * Migration system-024: app_config.features löschen — feature→product
 * ZUSAMMENZIEHEN (E11). Gegenstück zu system-023: seit Etappe B liest und
 * schreibt der Code nur noch `products`; David hat die Beobachtungsnacht
 * erlassen (2026-07-30, kein Produktivbetrieb). Läuft NACH dem Code-Deploy —
 * vorher schriebe der alte Dual-Write gegen eine gelöschte Spalte.
 *
 * IDEMPOTENT über 404 (Spalte weg = nichts zu tun). Auf einem frischen
 * Bootstrap legt system-018 die Spalte weiter an (Migrationen sind Protokoll)
 * und diese Migration räumt sie wieder ab — bewusst, damit jede Instanz
 * denselben Endzustand erreicht.
 *
 *   pnpm migrate --app <app> --layer system
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

console.log(`Migration system-024 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  // destruktiv-ok: E11-Zusammenziehen — products (system-023, backfilled)
  // ist seit Etappe B die einzige gelesene/geschriebene Spalte.
  await tablesDB.deleteColumn({ databaseId, tableId: 'app_config', key: 'features' })
  console.log('✔ Column app_config.features gelöscht')
}
catch (error) {
  if (hasCode(error, 404)) console.log('↷ Column app_config.features (schon weg)')
  else throw error
}

console.log('✔ Migration system-024 fertig')
