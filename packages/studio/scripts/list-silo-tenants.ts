/**
 * H3-4.2 Wellen-Runner-Helfer: listet die SILO-Projekte einer Update-Welle
 * aus der tenants-Table des Control Plane und druckt sie als JSON-Array auf
 * stdout (eine Zeile — maschinenlesbar für scripts/migrate.mjs --wave).
 *
 * Läuft mit den CONTROL-PLANE-Credentials (studio-Instanz), Aufruf durch den
 * Runner:
 *
 *   node --experimental-strip-types --env-file=<control-env> \
 *     packages/studio/scripts/list-silo-tenants.ts <internal|canary|stable>
 *
 * Liest bewusst mit Query.limit(500) + lautem Überlauf-Fehler statt stiller
 * Kappung — eine übersehene Silo-Instanz wäre ein nie migriertes Schema.
 */
import { Client, Query, TablesDB } from 'node-appwrite'
// Explizite .ts-Endungen: das Script läuft direkt unter Node
// --experimental-strip-types, das relative Imports nicht auflöst.
import { TENANT_WAVES, TENANTS_TABLE, type TenantRow, type TenantWave } from '../shared/types/tenantRecord.ts'
import { siloProjectsForWave } from '../shared/waves.ts'

const wave = process.argv[2] as TenantWave
if (!TENANT_WAVES.includes(wave)) {
  console.error(`✗ Welle fehlt/unbekannt: '${process.argv[2] ?? ''}' — erwartet: ${TENANT_WAVES.join(' | ')}`)
  process.exit(1)
}

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('✗ Control-Plane-Env unvollständig (NUXT_PUBLIC_APPWRITE_* + Key) — --control-env prüfen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { rows, total } = await tablesDB.listRows<TenantRow>({
  databaseId, tableId: TENANTS_TABLE, queries: [Query.limit(500)],
})
if (total > rows.length) {
  console.error(`✗ tenants-Table größer als das Lesefenster (${rows.length}/${total}) — Pagination im Helfer nachrüsten.`)
  process.exit(1)
}

console.log(JSON.stringify(siloProjectsForWave(rows, wave)))
