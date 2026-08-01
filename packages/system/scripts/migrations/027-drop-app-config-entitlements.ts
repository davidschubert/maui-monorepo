/**
 * Migration system-027: `app_config.entitlements` löschen — Aufräumen nach
 * system-020 (OPEN-ITEMS C6, Audit-Befund N2).
 *
 * Die Spalte trug bis system-019 das signierte Entitlement-Dokument. Sie liegt
 * in einer Table-read(any)-Tabelle (system-005, für die Live-Propagation von
 * Config-Flags und Themes an Gäste) — das Dokument war dort per Row-GET oder
 * Realtime für JEDEN Client abholbar. system-020 hat es nach
 * `app_secrets/global.entitlements` verlegt (leere Permissions, nur
 * Admin-Client) und den Wert mitgenommen; der Entitlement-Pull räumte die
 * Altspalte seither bei jedem Lauf leer.
 *
 * REIHENFOLGE: Diese Migration läuft NACH dem Code-Deploy, der den
 * 2-Wege-Read entfernt (packages/core/server/utils/entitlementsStore.ts —
 * `getLegacyEntitlementsDocument`/`clearLegacyEntitlementsDocument` sind
 * gefallen). Andersherum liefe der Lesefallback gegen eine gelöschte Spalte
 * und der Pull schriebe bei jedem Zyklus in ein Loch.
 *
 * IDEMPOTENT über 404 (Spalte weg = nichts zu tun). Auf einem frischen
 * Bootstrap legt system-019 die Spalte weiter an (Migrationen sind Protokoll,
 * kein Nachschlagewerk) und diese hier räumt sie wieder ab — bewusst, damit
 * jede Instanz denselben Endzustand erreicht.
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration system-027 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// Erst schauen, dann löschen: eine Instanz ohne system-Layer hat die Tabelle
// gar nicht. Query.limit(200) ist Pflicht — ohne explizites Limit liefert
// listColumns 25 Spalten, und app_config wächst mit jedem Flag.
const columns = await tablesDB.listColumns({ databaseId: db, tableId: 'app_config', queries: [Query.limit(200)] })
  .catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })

if (!columns) {
  console.log('↷ Tabelle app_config existiert auf dieser Instanz nicht — übersprungen')
}
else if (!columns.columns.some(column => column.key === 'entitlements')) {
  console.log('↷ Column app_config.entitlements (schon weg)')
}
else {
  try {
    // destruktiv-ok: der Wert lebt seit system-020 in app_secrets.entitlements
    // (dorthin migriert UND seither vom Pull dort geschrieben), die Altspalte
    // wird vom Pull leer geräumt und hat seit dem Deploy davor keinen Leser
    // mehr. Es geht hier also nichts verloren, was nicht doppelt läge —
    // schlimmster Fall ist ein Pull-Zyklus (15 min) bis zum nächsten Abholen.
    await tablesDB.deleteColumn({ databaseId: db, tableId: 'app_config', key: 'entitlements' })
    console.log('✔ Column app_config.entitlements gelöscht')
  }
  catch (error) {
    if (hasCode(error, 404)) console.log('↷ Column app_config.entitlements (schon weg)')
    else throw error
  }
}

console.log('✔ Migration system-027 fertig — das Entitlement-Dokument steht nur noch in app_secrets.')
