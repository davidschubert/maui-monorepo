/**
 * Migration media-004: E8 Etappe 3, Phase 2 — `communityId` NEBEN `tenantId`,
 * ADDITIV (media_items).
 *
 * Davids Auftrag: tenantId → communityId, überall. Appwrite kann Spalten
 * nicht umbenennen ⇒ je Tabelle: Spalte ergänzen (gleiche Größe wie die
 * Quelle), ALLE Werte kopieren, danach die Index-ZWILLINGE (jeder Index, der
 * tenantId trägt, bekommt sein community-Pendant — Unique erst NACH der
 * vollständigen Kopie, sonst kollidieren leere Werte; Regel aus
 * courses-002/pages-004). Die alten Spalten/Indizes fallen erst in der
 * Aufräum-Migration, wenn der Code umgestellt und der Drift-Nachlauf
 * gelaufen ist.
 *
 * GENERISCH wie control-029: die Quelle ist die Wahrheit (listColumns/
 * listIndexes), Backfill ist idempotent und upsert-fähig — ein Wiederholungs-
 * lauf nach dem Code-Deploy zieht Zeilen nach, die alter Code im Fenster nur
 * mit tenantId gestempelt hat.
 *
 *   pnpm migrate --app <app> --layer media
 */
import { Client, Query, TablesDB, type TablesDBIndexType, type Models } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
const { indexStep } = createIndexSteps(tablesDB, db)

const TABLES = ['media_items']

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

async function waitAvailable(tableId: string) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId })
    if (columns.every(c => c.status === 'available') && indexes.every(x => x.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`"${tableId}" wurde nicht vollständig verfügbar`)
}

console.log(`Migration media-004 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

for (const table of TABLES) {
  console.log(`— ${table} —`)
  const src = await tablesDB.listColumns({ databaseId: db, tableId: table, queries: [Query.limit(200)] }).catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (!src) {
    console.log(`↷ Tabelle ${table} existiert nicht auf dieser Instanz — übersprungen`)
    continue
  }
  const tenantCol = src.columns.find(c => c.key === 'tenantId') as { key: string, size?: number } | undefined
  if (!tenantCol) {
    console.log(`↷ ${table} hat keine tenantId-Spalte — übersprungen`)
    continue
  }

  await step(`Column ${table}.communityId`, () => tablesDB.createVarcharColumn({
    databaseId: db, tableId: table, key: 'communityId',
    size: tenantCol.size ?? 64, required: false, xdefault: '',
  }))
  await waitAvailable(table)

  // Backfill tenantId → communityId, nur wo das Ziel leer/abweichend ist.
  let befuellt = 0
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & { tenantId?: string, communityId?: string }>({
      databaseId: db, tableId: table, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of page.rows) {
      if (!row.tenantId || row.communityId === row.tenantId) continue
      await tablesDB.updateRow({ databaseId: db, tableId: table, rowId: row.$id, data: { communityId: row.tenantId } })
      befuellt++
    }
    if (page.rows.length < 100) break
  }
  console.log(`✔ ${table}: ${befuellt} Zeile(n) befüllt`)

  // Index-Zwillinge NACH der Kopie: jeder Index mit tenantId bekommt sein
  // community-Pendant (Key tenant→community, Spalte tenantId→communityId).
  const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId: table })
  for (const index of indexes) {
    if (!index.columns.includes('tenantId')) continue
    const twinKey = index.key.replace(/tenant/g, 'community')
    if (twinKey === index.key) throw new Error(`Index ${index.key} trägt tenantId, aber kein 'tenant' im Namen — Zwilling von Hand benennen.`)
    await indexStep(`Index ${table}.${twinKey}`, {
      tableId: table, key: twinKey,
      type: index.type as TablesDBIndexType,
      columns: index.columns.map(c => c === 'tenantId' ? 'communityId' : c),
    })
  }
  await waitAvailable(table)

  // Gegenprobe fail-loud: keine Zeile darf tenantId tragen und communityId missen.
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & { tenantId?: string, communityId?: string }>({
      databaseId: db, tableId: table, queries: [Query.limit(100), Query.offset(offset)],
    })
    const luecke = page.rows.find(row => row.tenantId && row.communityId !== row.tenantId)
    if (luecke) throw new Error(`Backfill unvollständig: ${table}/${luecke.$id}`)
    if (page.rows.length < 100) break
  }
  console.log(`✔ ${table}: Gegenprobe bestanden`)
}

console.log('✔ Migration media-004 fertig — ADDITIV; tenantId fällt erst mit der Aufräum-Migration.')
