/**
 * Migration studio-012: `tenants.wave` — Wellen-Zuordnung für Silo-Updates
 * (H3-4.2, Blueprint L5): Schema-Änderungen rollen über Silo-Projekte in
 * DREI Wellen aus (internal → canary → stable), abwärtskompatibel (Code n-1
 * ⇆ Schema n). Pool-Tenants teilen EIN Projekt — ihre Welle ist wirkungslos,
 * der Pool migriert immer genau einmal. Additiv, Bestand = 'stable'.
 * Idempotent (409 → skip). Aufruf über den Runner:
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

console.log(`Migration studio-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column tenants.wave', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'tenants', key: 'wave', elements: ['internal', 'canary', 'stable'], required: false, xdefault: 'stable',
}))

console.log('✔ Migration studio-012 fertig')
