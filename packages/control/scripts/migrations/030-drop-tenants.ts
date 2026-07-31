/**
 * Migration control-030: E8 Etappe 3, AUFRÄUMEN — die Alt-Tabellen `tenants`
 * und `tenant_plans` fallen.
 *
 * Läuft NACH dem Deploy des Codes, der nur noch communities/community_plans
 * liest und schreibt (COMMUNITIES_TABLE seit control-029). Vor jedem Löschen:
 * FINALER Kopierlauf (upsert, Zeilen MIT Row-Id — fängt Drift aus dem
 * Deploy-Fenster) und Gegenprobe fail-loud. Backups liegen unter
 * ~/.appwrite-secrets/backups/e8-3-*.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, type Models } from 'node-appwrite'

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

console.log(`Migration control-030 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

for (const [source, target] of [['tenants', 'communities'], ['tenant_plans', 'community_plans']] as const) {
  const src = await tablesDB.listColumns({ databaseId: db, tableId: source, queries: [Query.limit(200)] }).catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (!src) {
    console.log(`↷ ${source} schon weg`)
    continue
  }
  const columnKeys = src.columns.map(c => c.key)

  // Finaler Kopierlauf (upsert) — Drift aus dem Deploy-Fenster kann nicht überleben.
  let copied = 0
  let updated = 0
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & Record<string, unknown>>({
      databaseId: db, tableId: source, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of page.rows) {
      const data = Object.fromEntries(columnKeys.map(key => [key, row[key] ?? null]))
      try {
        await tablesDB.createRow({ databaseId: db, tableId: target, rowId: row.$id, data })
        copied++
      }
      catch (error) {
        if (!hasCode(error, 409)) throw error
        await tablesDB.updateRow({ databaseId: db, tableId: target, rowId: row.$id, data })
        updated++
      }
    }
    if (page.rows.length < 100) break
  }
  console.log(`✔ ${source} → ${target}: ${copied} kopiert, ${updated} aktualisiert`)

  const srcRows = await tablesDB.listRows({ databaseId: db, tableId: source, queries: [Query.limit(1000)] })
  const dstRows = await tablesDB.listRows({ databaseId: db, tableId: target, queries: [Query.limit(1000)] })
  const missing = srcRows.rows.filter(row => !dstRows.rows.some(d => d.$id === row.$id))
  if (missing.length > 0) {
    throw new Error(`Abbruch VOR dem Löschen: ${target} fehlt ${missing.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe ${source} (${srcRows.total}) ⊆ ${target} (${dstRows.total})`)

  // destruktiv-ok: E8-3-Aufräumen — Nachfolger trägt jede Zeile MIT Row-Id
  // (Gegenprobe oben bricht sonst ab); kein Code liest die alten Namen mehr
  // (COMMUNITIES_TABLE/COMMUNITY_PLANS_TABLE seit control-029, grep-Beweis).
  await tablesDB.deleteTable({ databaseId: db, tableId: source })
  console.log(`✔ Table ${source} gelöscht`)
}

console.log('✔ Migration control-030 fertig — communities/community_plans stehen allein.')
