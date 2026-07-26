/**
 * Migration studio-004: Spalte `sites.features` — Feature-Snapshot je Site
 * (M6-T4): JSON-Array der wirksam aktiven Feature-Keys, geliefert von der
 * Site selbst (GET /api/platform/features) und vom Health-Sweep persistiert.
 * Additiv + idempotent (409 → skip; sites-Table hat Budget-Headroom).
 *
 *   pnpm migrate --app <app> --layer studio
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

console.log(`Migration studio-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column sites.features', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'features', size: 1000, required: false, xdefault: '[]',
}))

console.log('✔ Migration studio-004 fertig')
