/**
 * Migration courses-006: E8 Etappe 3, AUFRÄUMEN — `tenantId` fällt (courses, lessons, enrollments, lesson_progress).
 *
 * Läuft NACH dem Deploy des Codes, der nur noch communityId stempelt und
 * liest (Davids Go: direkt nach den Isolationsbeweisen). Reihenfolge je
 * Tabelle: (1) FINALER Drift-Backfill (Zeilen aus dem Deploy-Fenster, die
 * alter Code nur mit tenantId stempelte), (2) Gegenprobe fail-loud — KEINE
 * Zeile darf tenantId tragen und communityId missen, sonst bricht der Lauf
 * VOR jedem Löschen ab, (3) alte tenantId-Indizes weg, (4) Spalte weg.
 *
 * IDEMPOTENT: Deletes über 404; ohne tenantId-Spalte ist nichts zu tun.
 *
 *   pnpm migrate --app <app> --layer courses
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

const TABLES = ['courses', 'lessons', 'enrollments', 'lesson_progress']

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function drop(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 404)) {
      console.log(`↷ ${label} (schon weg)`)
      return
    }
    throw error
  }
}

console.log(`Migration courses-006 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

for (const table of TABLES) {
  console.log(`— ${table} —`)
  const src = await tablesDB.listColumns({ databaseId: db, tableId: table }).catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (!src) {
    console.log(`↷ Tabelle ${table} existiert nicht auf dieser Instanz — übersprungen`)
    continue
  }
  if (!src.columns.some(c => c.key === 'tenantId')) {
    console.log(`↷ ${table}: tenantId schon weg`)
    continue
  }

  // (1) finaler Drift-Backfill + (2) Gegenprobe in EINEM Durchlauf
  let nachgezogen = 0
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & { tenantId?: string, communityId?: string }>({
      databaseId: db, tableId: table, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of page.rows) {
      if (!row.tenantId || row.communityId === row.tenantId) continue
      await tablesDB.updateRow({ databaseId: db, tableId: table, rowId: row.$id, data: { communityId: row.tenantId } })
      nachgezogen++
    }
    if (page.rows.length < 100) break
  }
  console.log(`✔ ${table}: ${nachgezogen} Drift-Zeile(n) nachgezogen`)
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & { tenantId?: string, communityId?: string }>({
      databaseId: db, tableId: table, queries: [Query.limit(100), Query.offset(offset)],
    })
    const luecke = page.rows.find(row => row.tenantId && row.communityId !== row.tenantId)
    if (luecke) throw new Error(`Abbruch VOR dem Löschen: ${table}/${luecke.$id} trägt tenantId ohne passende communityId.`)
    if (page.rows.length < 100) break
  }

  // destruktiv-ok: E8-3-Aufräumen — communityId trägt seit Phase 2 jede Zeile
  // (Backfill + Index-Zwillinge + Gegenprobe OBEN bricht sonst ab); der Code
  // liest/schreibt tenantId seit dem Deploy davor nicht mehr.
  const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId: table })
  for (const index of indexes) {
    if (!index.columns.includes('tenantId')) continue
    await drop(`Index ${table}.${index.key} löschen`, () => tablesDB.deleteIndex({ databaseId: db, tableId: table, key: index.key }))
  }
  await drop(`Column ${table}.tenantId löschen`, () => tablesDB.deleteColumn({ databaseId: db, tableId: table, key: 'tenantId' }))
}

console.log('✔ Migration courses-006 fertig — communityId steht allein.')
