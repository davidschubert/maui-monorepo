/**
 * Migration pages-004: Unique-Index tenant-aware machen. Der bisherige
 * `uq_slug_locale` (unique auf slug+locale) verbietet ZWEI Pool-Tenants
 * dieselbe Seite (z. B. beide 'home'/'en') — der neue Index nimmt tenantId
 * dazu, sodass jeder Tenant seinen eigenen slug+locale hat. Im Single-Tenant-
 * Betrieb (tenantId '') bleibt das Verhalten identisch (slug+locale eindeutig).
 * Idempotent. Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer pages
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

async function indexExists(key: string): Promise<boolean> {
  const { indexes } = await tablesDB.listIndexes({ databaseId: databaseId!, tableId: 'pages' })
  return (indexes as unknown as { key: string }[]).some(i => i.key === key)
}
async function waitForIndex(key: string) {
  for (let i = 0; i < 30; i++) {
    const { indexes } = await tablesDB.listIndexes({ databaseId: databaseId!, tableId: 'pages' })
    const idx = (indexes as unknown as { key: string, status: string }[]).find(i => i.key === key)
    if (idx?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Index ${key} wurde nicht 'available'`)
}

console.log(`Migration pages-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Neuen tenant-aware Unique-Index anlegen (idempotent), dann den alten löschen —
// in dieser Reihenfolge, damit nie ein Fenster OHNE Eindeutigkeitsschutz klafft.
if (await indexExists('uq_slug_locale_tenant')) {
  console.log('↷ Unique-Index uq_slug_locale_tenant (existiert bereits)')
}
else {
  await tablesDB.createIndex({
    databaseId, tableId: 'pages', key: 'uq_slug_locale_tenant',
    type: TablesDBIndexType.Unique, columns: ['slug', 'locale', 'tenantId'],
  })
  await waitForIndex('uq_slug_locale_tenant')
  console.log('✔ Unique-Index uq_slug_locale_tenant')
}

if (await indexExists('uq_slug_locale')) {
  await tablesDB.deleteIndex({ databaseId, tableId: 'pages', key: 'uq_slug_locale' })
    .catch((error) => { if (!hasCode(error, 404)) throw error })
  console.log('✔ alter Unique-Index uq_slug_locale entfernt')
}
else {
  console.log('↷ uq_slug_locale bereits entfernt')
}

console.log('✔ Migration pages-004 fertig')
