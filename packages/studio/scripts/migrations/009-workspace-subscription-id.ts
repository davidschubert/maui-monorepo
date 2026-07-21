/**
 * Migration studio-009: Spalte `workspaces.stripeSubscriptionId` — hält die
 * AKTUELL für den Workspace gültige Stripe-Subscription. Grundlage des
 * Cross-Sub-Guards (#6): ein `customer.subscription.deleted` degradiert den
 * Workspace nur dann auf `free`, wenn die gekündigte Sub die hinterlegte ist —
 * so kann das Kündigen eines ALTEN Abos ein neueres nicht kannibalisieren.
 * Additiv + idempotent (409 → skip). Leerer Default = Legacy-Row/kein Abo.
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

console.log(`Migration studio-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Stripe-Subscription-Ids sind kurz (sub_… ~28 Zeichen); 64 mit Reserve.
await step('Column workspaces.stripeSubscriptionId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'stripeSubscriptionId', size: 64, required: false, xdefault: '',
}))

console.log('✔ Migration studio-009 fertig')
