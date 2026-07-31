/**
 * Migration courses-003: `entitlementProduct` NEBEN `entitlementFeature`,
 * ADDITIV.
 *
 * Dritte Lücke der feature→product-Umbenennung (E11 Etappe B, gefunden
 * 2026-07-30): `entitlementFeature` ist nicht bloß ein TypeScript-Feld,
 * sondern die Appwrite-Spalte `courses.entitlementFeature` (courses-001) —
 * sie sagt, welcher Produkt-Schlüssel einen bezahlten Kurs freischaltet.
 * control-024 deckte nur das Control-Projekt ab (entitlements, websites);
 * diese Spalte liegt in den RUNTIME-Projekten der Instanzen mit
 * courses-Layer (comments, pool). Hätte man den Code zuerst umbenannt,
 * schriebe er dort gegen eine Spalte, die es nicht gibt.
 *
 * IDEMPOTENT: Spalte über 409, Backfill nur wo das Ziel leer ist.
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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => c.key === key)
    if (column && column.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration courses-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createVarcharColumn({
    databaseId, tableId: 'courses', key: 'entitlementProduct', size: 64, required: false,
  })
  console.log('✔ Column courses.entitlementProduct')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column courses.entitlementProduct (existiert bereits)')
  else throw error
}
await waitForColumn('courses', 'entitlementProduct')

// Backfill: entitlementFeature → entitlementProduct, nur wo das Ziel leer ist.
type CourseLike = Models.Row & { entitlementFeature?: string | null, entitlementProduct?: string | null }
const rows = await tablesDB.listRows<CourseLike>({
  databaseId, tableId: 'courses', queries: [Query.limit(1000)],
})
let befuellt = 0
for (const row of rows.rows) {
  if (row.entitlementProduct || !row.entitlementFeature) continue
  await tablesDB.updateRow({
    databaseId, tableId: 'courses', rowId: row.$id,
    data: { entitlementProduct: row.entitlementFeature },
  })
  befuellt++
}
console.log(`✔ courses: ${befuellt} von ${rows.total} Zeile(n) mit entitlementProduct befüllt`)

const nachher = await tablesDB.listRows<CourseLike>({
  databaseId, tableId: 'courses', queries: [Query.limit(1000)],
})
const luecken = nachher.rows.filter(row => row.entitlementFeature && !row.entitlementProduct)
if (luecken.length > 0) {
  throw new Error(`Backfill unvollständig — Rows ohne entitlementProduct: ${luecken.map(r => r.$id).join(', ')}`)
}

console.log('✔ Migration courses-003 fertig — ADDITIV, alter Code läuft unverändert.')
