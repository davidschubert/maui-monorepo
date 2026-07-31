/**
 * Migration control-028: A6 Schritt 1 — die Community bekommt Vertragsfelder,
 * ADDITIV und RUHEND.
 *
 * Davids Entscheidung (A6-WORKSPACES-ABLOESUNG.md, 2026-07-30): das Abo hängt
 * an der COMMUNITY, nicht am Workspace — heute erreicht eine Zahlung
 * `tenants.plan` nie (Beweis: packages/control/tests/a6-money-path.test.ts).
 * Diese Migration legt NUR die Spalten an; kein Code liest oder schreibt sie
 * bis Schritt 2 (Webhook schreibt zusätzlich `tenants.plan` + diese Felder).
 *
 * MUSS VOR DEM CODE-DEPLOY LAUFEN: `createRow<TenantRow>` verlangt ALLE
 * Spalten explizit (CLAUDE.md) — sobald der Code die Felder kennt, bricht das
 * Anlegen einer Community gegen ein Schema ohne sie.
 *
 * Namen bewusst Geldfluss-1-eindeutig (`billingStatus`, nicht paymentStatus):
 * Geldfluss 2 (Owner nimmt Geld von Mitgliedern, F7) kommt später DANEBEN,
 * nie hinein.
 *
 * IDEMPOTENT (409 → skip).
 *
 *   pnpm migrate --app control --layer control
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

const db = databaseId
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

async function waitForColumns(tableId: string, keys: string[]) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    const wanted = columns.filter(column => keys.includes(column.key))
    if (wanted.length === keys.length && wanted.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns ${keys.join(', ')} von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-028 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// Größen wie beim Workspace-Vorbild (control-005/009): Stripe-Ids sind ≤ 64.
await step('Column tenants.stripeCustomerId', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'tenants', key: 'stripeCustomerId', size: 64, required: false, xdefault: '',
}))
await step('Column tenants.stripeSubscriptionId', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'tenants', key: 'stripeSubscriptionId', size: 64, required: false, xdefault: '',
}))
// '' = nie ein Abo gehabt; sonst Stripe-Statusraum (active/past_due/canceled).
await step('Column tenants.billingStatus', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'tenants', key: 'billingStatus', size: 20, required: false, xdefault: '',
}))
await waitForColumns('tenants', ['stripeCustomerId', 'stripeSubscriptionId', 'billingStatus'])

// Webhook-Lookup „welche Community gehört zu diesem Stripe-Kunden?" —
// gleiches Muster wie workspaces.idx_stripe_customer (control-005).
await step('Index tenants.idx_stripe_customer', () => tablesDB.createIndex({
  databaseId: db, tableId: 'tenants', key: 'idx_stripe_customer',
  type: TablesDBIndexType.Key, columns: ['stripeCustomerId'],
}))

console.log('✔ Migration control-028 fertig — ADDITIV, ohne Wirkung bis A6 Schritt 2.')
